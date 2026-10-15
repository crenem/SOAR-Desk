//! Synthetic-only local document intake. No persistence or PHI protections yet.
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fs, path::Path, process::Command};
use tempfile::tempdir;

const MAX_BYTES: u64 = 15 * 1024 * 1024;
const MAX_PAGES: u32 = 25;
const MIN_TEXT_CHARS: usize = 40;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageText {
    pub page: u32,
    pub text: String,
    pub method: String,
    pub warning: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedDocument {
    pub document_id: String,
    pub sha256: String,
    pub pages: Vec<PageText>,
}
fn run(program: &str, args: &[&str]) -> Result<String, String> {
    let out = Command::new(program).args(args).output().map_err(|e| format!("{program}: {e}"))?;
    if !out.status.success() {
        return Err(format!("{program} exited unsuccessfully: {}", String::from_utf8_lossy(&out.stderr)));
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}
fn identify(bytes: &[u8]) -> Result<&'static str, String> {
    if bytes.starts_with(b"%PDF-") { Ok("pdf") }
    else if bytes.starts_with(&[0x89, b'P', b'N', b'G', 13, 10, 26, 10]) { Ok("png") }
    else if bytes.starts_with(&[0xff, 0xd8, 0xff]) { Ok("jpeg") }
    else if bytes.starts_with(b"II*\0") || bytes.starts_with(b"MM\0*") { Ok("tiff") }
    else { Err("Unsupported document signature (PDF, PNG, JPEG, TIFF only)".into()) }
}
/// Read text from a synthetic test document. Calling apps MUST enforce a synthetic-only gate.
/// All temporary images are removed when the function completes.
pub fn extract(path: &Path) -> Result<ExtractedDocument, String> {
    let metadata = fs::metadata(path).map_err(|e| e.to_string())?;
    if metadata.len() > MAX_BYTES { return Err("Document exceeds 15 MiB limit".into()); }
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    let kind = identify(&bytes)?;
    let hash = format!("{:x}", Sha256::digest(&bytes));
    let tmp = tempdir().map_err(|e| e.to_string())?;
    let filename = tmp.path().join(format!("input.{kind}"));
    fs::write(&filename, &bytes).map_err(|e| e.to_string())?;
    let input = filename.to_string_lossy().into_owned();
    let mut pages = Vec::new();
    if kind == "pdf" {
        let info = run("pdfinfo", &[&input])?;
        let count: u32 = info.lines().find_map(|line| line.strip_prefix("Pages:"))
            .and_then(|n| n.trim().parse().ok()).ok_or("Cannot determine PDF page count")?;
        if count == 0 || count > MAX_PAGES { return Err("PDF must contain 1–25 pages".into()); }
        for page in 1..=count {
            let p = page.to_string();
            let text = run("pdftotext", &["-f", &p, "-l", &p, "-layout", &input, "-"])?;
            let text = text.trim().to_string();
            if text.chars().count() >= MIN_TEXT_CHARS {
                pages.push(PageText { page, text, method: "embedded".into(), warning: None });
            } else {
                let prefix = tmp.path().join(format!("scan-{page}"));
                let prefix = prefix.to_string_lossy().into_owned();
                run("pdftoppm", &["-f", &p, "-l", &p, "-singlefile", "-r", "200", "-png", &input, &prefix])?;
                let png = format!("{prefix}.png");
                let ocr = run("tesseract", &[&png, "stdout", "-l", "eng"])?;
                pages.push(PageText { page, text: ocr.trim().into(), method: "ocr".into(), warning: if !text.is_empty() { Some("Short embedded text; OCR substituted, check original page".into()) } else { None } });
            }
        }
    } else {
        let ocr = run("tesseract", &[&input, "stdout", "-l", "eng"])?;
        pages.push(PageText { page: 1, text: ocr.trim().into(), method: "ocr".into(), warning: None });
    }
    Ok(ExtractedDocument { document_id: format!("SYN-{}", &hash[..12]), sha256: hash, pages })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn refuses_unknown_bytes() { assert!(identify(b"fake").is_err()); }
    #[test] fn accepts_png_magic() { assert_eq!(identify(&[137,80,78,71,13,10,26,10]).unwrap(), "png"); }
    #[test] fn rejects_missing_file() { assert!(extract(Path::new("/path/not/present/file.pdf")).is_err()); }
}
