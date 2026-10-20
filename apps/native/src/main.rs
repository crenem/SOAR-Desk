#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]
mod analysis;

use slint::{ComponentHandle, SharedString};
use soar_native_store::Store;
use std::{
    fs,
    path::PathBuf,
    sync::{Arc, Mutex},
    thread,
};

slint::include_modules!();

struct Context {
    store: Store,
    root: PathBuf,
    case_id: i64,
    selected: Option<i64>,
    busy: bool,
}

fn send_status(weak: slint::Weak<MainWindow>, text: impl Into<String>) {
    let status = text.into();
    let _ = slint::invoke_from_event_loop(move || {
        if let Some(ui) = weak.upgrade() {
            ui.set_status_text(status.into());
        }
    });
}

fn send_facts(weak: slint::Weak<MainWindow>, text: String) {
    let _ = slint::invoke_from_event_loop(move || {
        if let Some(ui) = weak.upgrade() {
            ui.set_evidence_text(text.into());
        }
    });
}

fn send_summary(weak: slint::Weak<MainWindow>, text: String) {
    let _ = slint::invoke_from_event_loop(move || {
        if let Some(ui) = weak.upgrade() {
            ui.set_summary_text(text.into());
        }
    });
}

fn set_processing(weak: slint::Weak<MainWindow>, busy: bool) {
    let _ = slint::invoke_from_event_loop(move || {
        if let Some(ui) = weak.upgrade() {
            ui.set_is_processing(busy);
        }
    });
}

fn document_labels(ctx: &Context) -> String {
    let docs = ctx.store.documents(ctx.case_id).unwrap_or_default();
    if docs.is_empty() {
        return "No documents yet.".into();
    }
    docs.iter()
        .map(|(id, name, _)| format!("#{}  {}", id, name))
        .collect::<Vec<_>>()
        .join("\n\n")
}

fn show_library(weak: slint::Weak<MainWindow>, title: String, labels: String) {
    let _ = slint::invoke_from_event_loop(move || {
        if let Some(ui) = weak.upgrade() {
            ui.set_case_title(title.into());
            ui.set_source_list(labels.into());
        }
    });
}

/// Runs after a successful upload, and also powers explicit retry.
/// The original document remains in SQLite/vault if AI is unavailable.
fn process_document(
    context: &Arc<Mutex<Context>>,
    weak: slint::Weak<MainWindow>,
    case_id: i64,
    doc_id: i64,
    path: PathBuf,
    root: PathBuf,
) -> Result<(), String> {
    send_status(weak.clone(), "Extracting document text...");
    let text = analysis::read_pages(&path)?;
    if text.trim().is_empty() {
        return Err("No readable document text was extracted.".into());
    }
    {
        let mut ctx = context.lock().map_err(|e| e.to_string())?;
        ctx.store
            .add_artifact(case_id, Some(doc_id), "extracted_text", "final", &text)
            .map_err(|e| format!("{e:?}"))?;
    }

    send_status(weak.clone(), "Initializing local AI engine...");
    let model = analysis::provision_model(&root, |s| send_status(weak.clone(), s))?;
    let _server = analysis::ModelServer::start(&model, |s| send_status(weak.clone(), s))?;

    let output = analysis::analyze(&text, |phase, content| match phase {
        "status" => send_status(weak.clone(), content),
        "facts" => send_facts(weak.clone(), content.to_owned()),
        "summary" => send_summary(weak.clone(), content.to_owned()),
        _ => {}
    })?;
    {
        let mut ctx = context.lock().map_err(|e| e.to_string())?;
        ctx.store
            .add_artifact(
                case_id,
                Some(doc_id),
                "structured_facts",
                "final",
                &output.facts,
            )
            .map_err(|e| format!("{e:?}"))?;
        ctx.store
            .add_artifact(case_id, Some(doc_id), "summary", "final", &output.summary)
            .map_err(|e| format!("{e:?}"))?;
    }
    Ok(())
}

fn finish_job(
    context: &Arc<Mutex<Context>>,
    weak: slint::Weak<MainWindow>,
    result: Result<(), String>,
) {
    if let Ok(mut ctx) = context.lock() {
        ctx.busy = false;
    }
    set_processing(weak.clone(), false);
    match result {
        Ok(()) => send_status(weak, "Analysis complete — summary and evidence saved."),
        Err(reason) => send_status(
            weak,
            format!("Document retained; analysis needs attention: {reason}"),
        ),
    }
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = dirs::data_local_dir()
        .unwrap_or(std::env::current_dir()?)
        .join("SOAR Desk");
    let store = match Store::open(&root) {
        Ok(s) => s,
        Err(err) => {
            rfd::MessageDialog::new()
                .set_title("SOAR Desk storage error")
                .set_description(format!("{err:?}"))
                .set_buttons(rfd::MessageButtons::Ok)
                .show();
            return Ok(());
        }
    };

    let recent = store.recent_case().ok().flatten();
    let (case_id, title) = recent.unwrap_or((0, "No case selected".to_string()));
    let selected = if case_id > 0 {
        store.documents(case_id).ok().and_then(|rows| rows.first().map(|row| row.0))
    } else {
        None
    };
    let context = Arc::new(Mutex::new(Context {
        store,
        root,
        case_id,
        selected,
        busy: false,
    }));
    let ui = MainWindow::new()?;
    ui.set_case_title(title.into());
    ui.set_model_status("Local Qwen; first analysis downloads ~2.5 GB".into());
    {
        let ctx = context.lock().expect("context");
        if ctx.case_id > 0 {
            ui.set_source_list(document_labels(&ctx).into());
            if let Ok(Some(name)) = ctx.store.get_field(ctx.case_id, "claimant_name") {
                if let Some(v) = name.value.as_str() {
                    ui.set_full_name(v.into());
                }
            }
            if let Ok(Some(dob)) = ctx.store.get_field(ctx.case_id, "dob") {
                if let Some(v) = dob.value.as_str() {
                    ui.set_dob(v.into());
                }
            }
            if let Some(last) = ctx.store.artifacts(ctx.case_id).ok().and_then(|rows| {
                rows.into_iter().rev().find(|a| a.kind == "summary")
            }) {
                ui.set_summary_text(last.body.into());
            }
        }
    }
    {
        let context = context.clone();
        let weak = ui.as_weak();
        ui.on_create_case(move || {
            let mut ctx = context.lock().expect("context");
            if ctx.busy {
                if let Some(ui) = weak.upgrade() {
                    ui.set_status_text("Wait until document processing completes.".into());
                }
                return;
            }
            match ctx.store.create_case("New case") {
                Ok(id) => {
                    ctx.case_id = id;
                    ctx.selected = None;
                    if let Some(ui) = weak.upgrade() {
                        ui.set_case_title(format!("Case #{id}").into());
                        ui.set_full_name("".into());
                        ui.set_dob("".into());
                        ui.set_source_list("No documents yet.".into());
                        ui.set_summary_text("Upload a document to begin.".into());
                        ui.set_evidence_text("Structured evidence will appear after pass 1.".into());
                        ui.set_status_text("New case created".into());
                    }
                }
                Err(e) => {
                    if let Some(ui) = weak.upgrade() {
                        ui.set_status_text(format!("Database error: {e:?}").into());
                    }
                }
            }
        });
    }
    {
        let context = context.clone();
        let weak = ui.as_weak();
        ui.on_save_field(move |key: SharedString, value: SharedString| {
            let mut ctx = context.lock().expect("context");
            if ctx.case_id == 0 {
                if let Some(ui) = weak.upgrade() {
                    ui.set_field_state("!".into());
                    ui.set_status_text("Upload a document or create a case first.".into());
                }
                return;
            }
            let key = key.to_string();
            let revision = ctx
                .store
                .get_field(ctx.case_id, &key)
                .ok()
                .flatten()
                .map(|f| f.revision)
                .unwrap_or(0);
            let value = serde_json::Value::String(value.to_string());
            let id = ctx.case_id;
            match ctx.store.save_field(id, &key, &value, revision, "user") {
                Ok(_) => {
                    if let Some(ui) = weak.upgrade() {
                        ui.set_field_state("✓".into());
                    }
                }
                Err(err) => {
                    if let Some(ui) = weak.upgrade() {
                        ui.set_field_state("!".into());
                        ui.set_status_text(format!("Save failed: {err:?}").into());
                    }
                }
            }
        });
    }
    {
        let context = context.clone();
        let weak = ui.as_weak();
        ui.on_pick_document(move || {
            {
                let ctx = context.lock().expect("context");
                if ctx.busy {
                    if let Some(ui) = weak.upgrade() {
                        ui.set_status_text("A document is already being processed.".into());
                    }
                    return;
                }
            }
            if let Some(ui) = weak.upgrade() {
                ui.set_status_text("Opening Windows document picker...".into());
            }
            // Opening the picker does not require creating an empty case.
            let picked = rfd::FileDialog::new()
                .set_title("Select a record for SOAR Desk")
                .add_filter("Documents", &["pdf", "txt", "md", "png", "jpg", "jpeg", "tiff"])
                .pick_file();
            let Some(path) = picked else {
                if let Some(ui) = weak.upgrade() {
                    ui.set_status_text("No document selected.".into());
                }
                return;
            };
            {
                let mut ctx = context.lock().expect("context");
                ctx.busy = true;
            }
            set_processing(weak.clone(), true);
            send_status(weak.clone(), "Importing document to the evidence library...");
            let context = context.clone();
            let weak = weak.clone();
            thread::spawn(move || {
                let result = (|| -> Result<(), String> {
                    let bytes = fs::read(&path).map_err(|e| format!("Could not read file: {e}"))?;
                    if bytes.is_empty() {
                        return Err("The selected file is empty.".into());
                    }
                    let filename = path.file_name().map(|n| n.to_string_lossy().to_string())
                        .ok_or("Document filename is missing.")?;
                    let mime = if filename.to_lowercase().ends_with(".pdf") {
                        "application/pdf"
                    } else if filename.to_lowercase().ends_with(".txt")
                        || filename.to_lowercase().ends_with(".md")
                    {
                        "text/plain"
                    } else {
                        "application/octet-stream"
                    };
                    let (case_id, doc_id, stored_path, root, title, labels) = {
                        let mut ctx = context.lock().map_err(|e| e.to_string())?;
                        if ctx.case_id == 0 {
                            ctx.case_id = ctx.store.create_case("New case")
                                .map_err(|e| format!("Could not create case: {e:?}"))?;
                        }
                        let case_id = ctx.case_id;
                        let doc_id = ctx.store.import_document(case_id, &filename, mime, &bytes)
                            .map_err(|e| format!("Could not preserve original: {e:?}"))?;
                        let stored_path = ctx.store.documents(case_id)
                            .map_err(|e| format!("Could not list documents: {e:?}"))?
                            .into_iter()
                            .find(|(id, _, _)| *id == doc_id)
                            .map(|(_, _, path)| PathBuf::from(path))
                            .ok_or("Imported document could not be located.")?;
                        ctx.selected = Some(doc_id);
                        let title = format!("Case #{case_id}");
                        let labels = document_labels(&ctx);
                        (case_id, doc_id, stored_path, ctx.root.clone(), title, labels)
                    };
                    show_library(weak.clone(), title, labels);
                    send_status(weak.clone(), format!("Imported {filename}. Starting analysis..."));
                    process_document(&context, weak.clone(), case_id, doc_id, stored_path, root)
                })();
                finish_job(&context, weak, result);
            });
        });
    }
    {
        let context = context.clone();
        let weak = ui.as_weak();
        ui.on_analyze(move || {
            let selected = {
                let mut ctx = context.lock().expect("context");
                if ctx.busy {
                    if let Some(ui) = weak.upgrade() {
                        ui.set_status_text("Document processing is already in progress.".into());
                    }
                    return;
                }
                let Some(doc_id) = ctx.selected else {
                    if let Some(ui) = weak.upgrade() {
                        ui.set_status_text("Upload a document first.".into());
                    }
                    return;
                };
                let path = ctx.store.documents(ctx.case_id).unwrap_or_default().into_iter()
                    .find(|(id, _, _)| *id == doc_id).map(|(_, _, path)| PathBuf::from(path));
                let Some(path) = path else {
                    if let Some(ui) = weak.upgrade() {
                        ui.set_status_text("Document missing from case.".into());
                    }
                    return;
                };
                ctx.busy = true;
                Some((ctx.case_id, doc_id, path, ctx.root.clone()))
            };
            let Some((case_id, doc_id, path, root)) = selected else {
                return;
            };
            set_processing(weak.clone(), true);
            let context = context.clone();
            let weak = weak.clone();
            thread::spawn(move || {
                let result = process_document(&context, weak.clone(), case_id, doc_id, path, root);
                finish_job(&context, weak, result);
            });
        });
    }
    {
        let context = context.clone();
        let weak = ui.as_weak();
        ui.on_narrative(move || {
            let (id, root, evidence) = {
                let mut ctx = context.lock().expect("context");
                if ctx.busy {
                    if let Some(ui) = weak.upgrade() {
                        ui.set_status_text("Wait for the current analysis to finish.".into());
                    }
                    return;
                }
                if ctx.case_id == 0 {
                    if let Some(ui) = weak.upgrade() {
                        ui.set_status_text("Upload a document first.".into());
                    }
                    return;
                }
                let artifacts = ctx.store.artifacts(ctx.case_id).unwrap_or_default();
                let source = artifacts
                    .iter()
                    .filter(|a| a.kind == "summary" || a.kind == "structured_facts")
                    .map(|a| format!("Document {:?}, artifact {} v{}:\n{}", a.document_id, a.kind, a.version, a.body))
                    .collect::<Vec<_>>()
                    .join("\n\n---\n\n");
                if source.trim().is_empty() {
                    if let Some(ui) = weak.upgrade() {
                        ui.set_status_text("Analyze a document before generating a narrative.".into());
                    }
                    return;
                }
                ctx.busy = true;
                (ctx.case_id, ctx.root.clone(), source)
            };
            set_processing(weak.clone(), true);
            let context = context.clone();
            let weak = weak.clone();
            thread::spawn(move || {
                let result = (|| -> Result<(), String> {
                    let model = analysis::provision_model(&root, |s| send_status(weak.clone(), s))?;
                    let _server = analysis::ModelServer::start(&model, |s| send_status(weak.clone(), s))?;
                    send_status(weak.clone(), "Generating balanced case narrative...");
                    let mut combined = String::new();
                    let narrative = analysis::disability_narrative(&evidence, |token| {
                        combined.push_str(token);
                        send_summary(weak.clone(), combined.clone());
                    })?;
                    let mut ctx = context.lock().map_err(|e| e.to_string())?;
                    ctx.store.add_artifact(id, None, "disability_narrative", "draft", &narrative)
                        .map_err(|e| format!("{e:?}"))?;
                    Ok(())
                })();
                if let Ok(mut ctx) = context.lock() {
                    ctx.busy = false;
                }
                set_processing(weak.clone(), false);
                match result {
                    Ok(()) => send_status(weak, "Narrative draft saved as a new version."),
                    Err(e) => send_status(weak, format!("Narrative could not be generated: {e}")),
                }
            });
        });
    }
    ui.run()?;
    Ok(())
}
