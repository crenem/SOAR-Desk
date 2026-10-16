//! Installs one reviewed, unmodified, BLANK SSA-16 form via a user-selected
//! local file. No downloading, no network access, no client data, no overwrites.
//! The fingerprint is from the original 09-2025 SSA-16 used for widget tests.
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

// Reviewed seven-page SSA-16 (09-2025), 148 AcroForm/XFA widgets.
// SHA-256 of the original blank PDF from the user's supplied form.
const EXPECTED_SHA256: &str =
    "09c088cbbf688b2e14a1061d2ff31cd481344de2ba5eacfac030f61045ba548e";
const MAX_TEMPLATE_BYTES: u64 = 25_000_000;

#[derive(Serialize)]
pub struct Ssa16TemplateStatus {
    pub installed: bool,
    pub message: String,
}

fn template_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../.local/ssa-templates/ssa-16-bk.pdf")
}

fn matches_reviewed_form(contents: &[u8]) -> bool {
    !contents.is_empty()
        && (contents.len() as u64) <= MAX_TEMPLATE_BYTES
        && contents.starts_with(b"%PDF-")
        && format!("{:x}", Sha256::digest(contents)) == EXPECTED_SHA256
}

fn cached_file_ok(path: &Path) -> bool {
    match fs::symlink_metadata(path) {
        Ok(meta) if meta.file_type().is_file() && meta.len() <= MAX_TEMPLATE_BYTES => {
            fs::read(path).is_ok_and(|content| matches_reviewed_form(&content))
        }
        _ => false,
    }
}

#[tauri::command]
pub fn ssa16_template_status() -> Ssa16TemplateStatus {
    let installed = cached_file_ok(&template_path());
    Ssa16TemplateStatus {
        installed,
        message: if installed {
            "Reviewed, blank SSA-16 (09-2025) is installed locally.".into()
        } else {
            "SSA-16 template is missing or unverified. Select the original blank PDF with 'Install SSA-16 PDF'. A modified, filled, or different-edition form will be refused.".into()
        },
    }
}

#[tauri::command]
pub fn install_ssa16_template(source_path: String) -> Result<Ssa16TemplateStatus, String> {
    let src = Path::new(&source_path);
    if !src.is_absolute() {
        return Err("Select an absolute local path to a blank SSA-16 PDF.".into());
    }
    let meta = fs::symlink_metadata(src)
        .map_err(|_| "Cannot read the selected SSA-16 source file.".to_string())?;
    if !meta.file_type().is_file() || meta.len() == 0 || meta.len() > MAX_TEMPLATE_BYTES {
        return Err("Source must be a regular, bounded PDF file (no links).".into());
    }
    let bytes = fs::read(src).map_err(|_| "Cannot read the selected PDF.".to_string())?;
    if !matches_reviewed_form(&bytes) {
        return Err("PDF does not match the reviewed, blank SSA-16 (09-2025). Choose the unchanged official form; do not use a filled, re-saved, or alternative edition.".into());
    }
    let dest = template_path();
    if dest.exists() {
        if cached_file_ok(&dest) {
            return Ok(ssa16_template_status());
        }
        return Err("A different or invalid file already occupies the SSA-16 template cache. It was not overwritten; resolve this manually.".into());
    }
    let dir = dest.parent().ok_or("Invalid template cache destination.")?;
    fs::create_dir_all(dir)
        .map_err(|_| "Could not create the local SSA template directory.".to_string())?;
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(&dest)
        .map_err(|_| "Could not install the template: file exists or directory is inaccessible.".to_string())?;
    if file.write_all(&bytes).and_then(|_| file.sync_all()).is_err() {
        drop(file);
        let _ = fs::remove_file(&dest);
        return Err("Template could not be completely written.".into());
    }
    if !cached_file_ok(&dest) {
        let _ = fs::remove_file(&dest);
        return Err("Post-installation template verification failed.".into());
    }
    Ok(ssa16_template_status())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unverified_or_modified_pdfs() {
        assert!(!matches_reviewed_form(b"%PDF-1.7\nnot-an-original-SSA-form"));
        assert!(!matches_reviewed_form(b"bad"));
        assert!(!matches_reviewed_form(&[]));
    }
    #[test]
    fn source_must_be_absolute_and_regular() {
        let result = install_ssa16_template("relative/ssa-16-bk.pdf".into());
        assert!(result.is_err());
    }
    #[test]
    fn fingerprint_is_a_sha256_digest() {
        assert_eq!(EXPECTED_SHA256.len(), 64);
        assert!(EXPECTED_SHA256.chars().all(|c| c.is_ascii_hexdigit()));
    }
}
