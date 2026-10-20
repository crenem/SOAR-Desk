#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]
mod analysis;
use std::{fs, path::PathBuf, sync::{Arc,Mutex}, thread};
use slint::{ComponentHandle, SharedString};
use soar_native_store::Store;

slint::include_modules!();

struct Context {
    store:Store,
    root:PathBuf,
    case_id:i64,
    selected:Option<i64>,
}
fn send_status(weak:slint::Weak<MainWindow>, text:impl Into<String>) {
    let status=text.into();
    let _=slint::invoke_from_event_loop(move ||{
        if let Some(ui)=weak.upgrade(){ui.set_status_text(status.into());}
    });
}
fn send_facts(weak:slint::Weak<MainWindow>, text:String) {
    let _=slint::invoke_from_event_loop(move ||{
        if let Some(ui)=weak.upgrade(){ui.set_evidence_text(text.into());}
    });
}
fn send_summary(weak:slint::Weak<MainWindow>, text:String) {
    let _=slint::invoke_from_event_loop(move ||{
        if let Some(ui)=weak.upgrade(){ui.set_summary_text(text.into());}
    });
}
fn document_labels(ctx:&Context)->String {
    ctx.store.documents(ctx.case_id).unwrap_or_default().iter().map(|(id,name,_)|
        format!("#{}  {}",id,name)
    ).collect::<Vec<_>>().join("\n\n")
}
fn main()->Result<(),Box<dyn std::error::Error>>{
    let root=dirs::data_local_dir().unwrap_or(std::env::current_dir()?).join("SOAR Desk");
    let store=match Store::open(&root){
        Ok(s)=>s,
        Err(err)=>{rfd::MessageDialog::new().set_title("SOAR Desk storage error").set_description(format!("{err:?}")).set_buttons(rfd::MessageButtons::Ok).show();return Ok(())}
    };
    let recent=store.recent_case().ok().flatten();
    let (case_id,title)=recent.unwrap_or((0,"No case selected".to_string()));
    let context=Arc::new(Mutex::new(Context {store,root,case_id,selected:None}));
    let ui=MainWindow::new()?;
    ui.set_case_title(title.into());
    ui.set_model_status("Runs locally; first use downloads Qwen (~2.5 GB)".into());
    {
        let guard=context.lock().expect("context");
        if guard.case_id>0 {
            ui.set_source_list(document_labels(&guard).into());
            if let Ok(Some(name))=guard.store.get_field(guard.case_id,"claimant_name") {
                if let Some(v)=name.value.as_str(){ui.set_full_name(v.into());}
            }
            if let Ok(Some(dob))=guard.store.get_field(guard.case_id,"dob") {
                if let Some(v)=dob.value.as_str(){ui.set_dob(v.into());}
            }
        }
    }
    {
        let context=context.clone();
        let weak=ui.as_weak();
        ui.on_create_case(move ||{
            let mut ctx=context.lock().expect("context");
            match ctx.store.create_case("New case") {
                Ok(id)=>{
                    ctx.case_id=id;ctx.selected=None;
                    if let Some(ui)=weak.upgrade() {
                        ui.set_case_title(format!("Case #{}",id).into());
                        ui.set_full_name("".into());ui.set_dob("".into());
                        ui.set_source_list("No documents yet.".into());
                        ui.set_summary_text("Upload a document to begin.".into());
                        ui.set_evidence_text("Structured evidence will appear after pass 1.".into());
                        ui.set_status_text("New case created".into());
                    }
                }
                Err(e)=>{if let Some(ui)=weak.upgrade(){ui.set_status_text(format!("Database error: {e:?}").into());}}
            }
        });
    }
    {
        let context=context.clone();
        let weak=ui.as_weak();
        ui.on_save_field(move |key:SharedString,value:SharedString|{
            let mut ctx=context.lock().expect("context");
            if ctx.case_id==0 {if let Some(ui)=weak.upgrade(){ui.set_field_state("!".into());ui.set_status_text("Create a case first".into());}return;}
            let key=key.to_string();
            let revision=ctx.store.get_field(ctx.case_id,&key).ok().flatten().map(|f|f.revision).unwrap_or(0);
            let v=serde_json::Value::String(value.to_string());
            let id=ctx.case_id;
            match ctx.store.save_field(id,&key,&v,revision,"user"){
                Ok(_)=>{if let Some(ui)=weak.upgrade(){ui.set_field_state("✓".into());}},
                Err(err)=>{if let Some(ui)=weak.upgrade(){ui.set_field_state("!".into());ui.set_status_text(format!("Save failed: {err:?}").into());}}
            }
        });
    }
    {
        let context=context.clone();
        let weak=ui.as_weak();
        ui.on_pick_document(move ||{
            let picked=rfd::FileDialog::new().add_filter("Records",&["pdf","txt","md","png","jpg","jpeg","tiff"]).pick_file();
            let Some(path)=picked else{return};
            let mut ctx=context.lock().expect("context");
            if ctx.case_id==0 {if let Some(ui)=weak.upgrade(){ui.set_status_text("Create a case first".into());}return;}
            let data=match fs::read(&path){Ok(b)=>b,Err(e)=>{if let Some(ui)=weak.upgrade(){ui.set_status_text(format!("Read error: {e}").into());}return}};
            let filename=path.file_name().map(|n|n.to_string_lossy().to_string()).unwrap_or_default();
            let mime=if filename.to_lowercase().ends_with(".pdf"){"application/pdf"}else{"application/octet-stream"};
            let id=ctx.case_id;
            match ctx.store.import_document(id,&filename,mime,&data){
                Ok(doc_id)=>{
                    ctx.selected=Some(doc_id);
                    if let Some(ui)=weak.upgrade(){
                        ui.set_source_list(document_labels(&ctx).into());
                        ui.set_status_text(format!("Uploaded {filename} — ready to analyze").into());
                    }
                }
                Err(e)=>{if let Some(ui)=weak.upgrade(){ui.set_status_text(format!("Import failed: {e:?}").into());}}
            }
        });
    }
    {
        let context=context.clone();
        let weak=ui.as_weak();
        ui.on_analyze(move ||{
            let (case_id,doc_id,path,root)={
                let ctx=context.lock().expect("context");
                let Some(doc_id)=ctx.selected else {
                    if let Some(ui)=weak.upgrade(){ui.set_status_text("Upload a new document to analyze".into());}
                    return;
                };
                let path=ctx.store.documents(ctx.case_id).unwrap_or_default().into_iter()
                    .find(|(id,_,_)|*id==doc_id).map(|(_,_,p)|PathBuf::from(p));
                let Some(path)=path else {
                    if let Some(ui)=weak.upgrade(){ui.set_status_text("Document missing from case".into());}
                    return;
                };
                (ctx.case_id,doc_id,path,ctx.root.clone())
            };
            if let Some(ui)=weak.upgrade(){
                ui.set_status_text("Extracting document text...".into());
                ui.set_evidence_text("Waiting for pass 1...".into());
                ui.set_summary_text("Waiting for pass 2...".into());
            }
            let context=context.clone();let weak=weak.clone();
            thread::spawn(move ||{
                let result=(||->Result<(),String>{
                    let text=analysis::read_pages(&path)?;
                    {
                        let mut ctx=context.lock().map_err(|e|e.to_string())?;
                        ctx.store.add_artifact(case_id,Some(doc_id),"extracted_text","final",&text).map_err(|e|format!("{e:?}"))?;
                    }
                    let model=analysis::provision_model(&root,|s|send_status(weak.clone(),s))?;
                    let _server=analysis::ModelServer::start(&model,|s|send_status(weak.clone(),s))?;
                    let mut last_summary=String::new();
                    let output=analysis::analyze(&text,|phase,content|{
                        match phase{
                            "status"=>send_status(weak.clone(),content),
                            "facts"=>send_facts(weak.clone(),content.to_owned()),
                            "summary"=>{last_summary=content.to_owned();send_summary(weak.clone(),last_summary.clone());},
                            _=>{}
                        }
                    })?;
                    let mut ctx=context.lock().map_err(|e|e.to_string())?;
                    ctx.store.add_artifact(case_id,Some(doc_id),"structured_facts","final",&output.facts).map_err(|e|format!("{e:?}"))?;
                    ctx.store.add_artifact(case_id,Some(doc_id),"summary","final",&output.summary).map_err(|e|format!("{e:?}"))?;
                    Ok(())
                })();
                match result {
                    Ok(())=>send_status(weak,"Two passes complete; evidence and summary saved"),
                    Err(e)=>send_status(weak,format!("Analysis stopped: {e}"))
                };
            });
        });
    }
    {
        let context=context.clone();
        let weak=ui.as_weak();
        ui.on_narrative(move ||{
            let (id,root,evidence)={
                let ctx=context.lock().expect("context");
                if ctx.case_id==0 {if let Some(ui)=weak.upgrade(){ui.set_status_text("Create a case first".into());}return;}
                let artifacts=ctx.store.artifacts(ctx.case_id).unwrap_or_default();
                let source=artifacts.iter().filter(|a|a.kind=="summary"||a.kind=="structured_facts").map(|a|
                    format!("Document {:?}, artifact {} v{}:\n{}",a.document_id,a.kind,a.version,a.body)
                ).collect::<Vec<_>>().join("\n\n---\n\n");
                (ctx.case_id,ctx.root.clone(),source)
            };
            if evidence.trim().is_empty(){if let Some(ui)=weak.upgrade(){ui.set_status_text("Analyze a document first".into());}return;}
            let weak=weak.clone();let context=context.clone();
            thread::spawn(move ||{
                let res=(||->Result<(),String>{
                    let model=analysis::provision_model(&root,|s|send_status(weak.clone(),s))?;
                    let _server=analysis::ModelServer::start(&model,|s|send_status(weak.clone(),s))?;
                    send_status(weak.clone(),"Generating balanced case narrative...");
                    let mut combined=String::new();
                    let narrative=analysis::disability_narrative(&evidence,|token| {
                        combined.push_str(token);send_summary(weak.clone(),combined.clone());
                    })?;
                    let mut ctx=context.lock().map_err(|e|e.to_string())?;
                    ctx.store.add_artifact(id,None,"disability_narrative","draft",&narrative).map_err(|e|format!("{e:?}"))?;
                    Ok(())
                })();
                match res{Ok(())=>send_status(weak,"Narrative draft saved as a new version"),Err(e)=>send_status(weak,format!("Narrative failed: {e}"))}
            });
        });
    }
    ui.run()?;
    Ok(())
}
