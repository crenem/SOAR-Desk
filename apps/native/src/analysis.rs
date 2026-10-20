//! Windows-local inference pipeline. No document is sent to a cloud endpoint.
//! Installers include llama-server; the Apache-2.0 Qwen GGUF downloads on first use.
use std::{fs::{self,File},io::{BufRead,BufReader,Read,Write},path::{Path,PathBuf},process::{Child,Command,Stdio},thread,time::Duration};
use sha2::{Sha256,Digest};

pub const MODEL_URL:&str="https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_K_M.gguf";
pub const MODEL_SHA256:&str="3605803b982cb64aead44f6c1b2ae36e3acdb41d8e46c8a94c6533bc4c67e597";
const API:&str="http://127.0.0.1:18081/v1/chat/completions";

pub fn read_pages(path:&Path)->Result<String,String>{
    let ext=path.extension().and_then(|x|x.to_str()).unwrap_or("").to_ascii_lowercase();
    if ext=="txt"||ext=="md" {return fs::read_to_string(path).map(|t|format!("[Page 1]\n{t}")).map_err(|e|e.to_string());}
    if ext!="pdf" {return Err("Image OCR is not yet implemented in the native preview. Choose a text PDF.".into())}
    let doc=lopdf::Document::load(path).map_err(|e|format!("PDF open: {e}"))?;
    let mut output=String::new();
    for (page,_) in doc.get_pages(){
        let text=doc.extract_text(&[page]).map_err(|e|format!("PDF page {page}: {e}"))?;
        if !text.trim().is_empty() {output.push_str(&format!("\n[Page {page}]\n{}\n",text.trim()));}
    }
    if output.trim().is_empty(){return Err("No embedded PDF text. Scanned pages require the upcoming Windows OCR integration.".into())}
    Ok(output)
}
pub fn chunks(s:&str,max_chars:usize)->Vec<String>{
    let mut out=Vec::new();let mut current=String::new();
    for c in s.chars() {
        current.push(c);
        if current.chars().count()>=max_chars {out.push(std::mem::take(&mut current));}
    }
    if !current.is_empty(){out.push(current);}
    out
}
pub fn model_path(root:&Path)->PathBuf {root.join("models").join("Qwen3-4B-Instruct-2507-Q4_K_M.gguf")}
pub fn provision_model(root:&Path,mut notify:impl FnMut(String))->Result<PathBuf,String>{
    let p=model_path(root); if p.exists() {
        let size=fs::metadata(&p).map_err(|e|e.to_string())?.len();
        if size>2_000_000_000 {return Ok(p);}
        let _=fs::remove_file(&p);
    }
    fs::create_dir_all(p.parent().ok_or("Invalid model path")?).map_err(|e|e.to_string())?;
    notify("Downloading local Qwen model (about 2.5 GB); first run needs internet.".into());
    let client=reqwest::blocking::Client::builder().timeout(Duration::from_secs(600)).build().map_err(|e|e.to_string())?;
    let mut response=client.get(MODEL_URL).send().map_err(|e|e.to_string())?.error_for_status().map_err(|e|e.to_string())?;
    let total=response.content_length().unwrap_or(2_500_000_000);
    let temp=p.with_extension("gguf.partial");
    let mut file=File::create(&temp).map_err(|e|e.to_string())?;
    let mut buffer=[0u8;64*1024];let mut count=0u64;let mut notified=0u64;let mut digest=Sha256::new();
    loop {
        let n=response.read(&mut buffer).map_err(|e|e.to_string())?;
        if n==0 {break}
        file.write_all(&buffer[..n]).map_err(|e|e.to_string())?;
        digest.update(&buffer[..n]);count+=n as u64;
        if count.saturating_sub(notified)>64*1024*1024 {
            notify(format!("Downloading model: {}%",(count.saturating_mul(100)/total).min(100)));
            notified=count;
        }
    }
    file.sync_all().map_err(|e|e.to_string())?;
    if format!("{:x}",digest.finalize())!=MODEL_SHA256 {return Err("Model SHA-256 verification failed. Partial download retained.".into())}
    fs::rename(temp,&p).map_err(|e|e.to_string())?;
    notify("Local model verified.".into()); Ok(p)
}
pub struct ModelServer {child: Option<Child>}
impl Drop for ModelServer {fn drop(&mut self){if let Some(mut c)=self.child.take(){let _=c.kill();let _=c.wait();}}}
impl ModelServer {
    pub fn start(model:&Path,mut notify:impl FnMut(String))->Result<Self,String>{
        let exe=std::env::current_exe().map_err(|e|e.to_string())?;
        let bin=exe.parent().ok_or("Invalid installed application path")?.join("runtime").join("llama-server.exe");
        if !bin.exists(){return Err(format!("Bundled Windows inference engine not found: {}",bin.display()))}
        notify("Loading local model into memory...".into());
        let child=Command::new(bin).args(["--model",model.to_str().ok_or("Model path encoding")?,"--host","127.0.0.1","--port","18081","--ctx-size","8192","--parallel","1","--n-gpu-layers","0"])
            .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn().map_err(|e|e.to_string())?;
        let client=reqwest::blocking::Client::builder().timeout(Duration::from_secs(2)).build().map_err(|e|e.to_string())?;
        let mut server=Self{child:Some(child)};
        for _ in 0..90 {
            if let Some(ref mut p)=server.child {if let Ok(Some(status))=p.try_wait(){return Err(format!("Local model process exited: {status}"))}}
            if let Ok(r)=client.get("http://127.0.0.1:18081/health").send() {if r.status().is_success(){notify("Local model ready.".into());return Ok(server)}}
            thread::sleep(Duration::from_secs(1));
        }
        Err("Local inference engine did not become ready within 90 seconds.".into())
    }
}
fn request(prompt:&str,stream:bool)->Result<reqwest::blocking::Response,String>{
    let client=reqwest::blocking::Client::builder().timeout(Duration::from_secs(1200)).build().map_err(|e|e.to_string())?;
    client.post(API).json(&serde_json::json!({
        "model":"local","messages":[{"role":"system","content":"You are an evidence extraction assistant for a disability representative. Use only supplied source text, quote specific page numbers, distinguish self-report from observed evidence, and never invent facts. Drafts require human verification."},{"role":"user","content":prompt}],
        "stream":stream,"temperature":0.1,"max_tokens":2500
    })).send().map_err(|e|e.to_string())?.error_for_status().map_err(|e|e.to_string())
}
fn complete(prompt:&str)->Result<String,String>{
    let json:serde_json::Value=request(prompt,false)?.json().map_err(|e|e.to_string())?;
    json["choices"][0]["message"]["content"].as_str().map(str::to_owned).ok_or("Model response is missing content".into())
}
fn stream(prompt:&str,mut token:impl FnMut(&str))->Result<String,String>{
    let mut response=BufReader::new(request(prompt,true)?);
    let mut line=String::new();let mut output=String::new();
    loop {
        line.clear();let n=response.read_line(&mut line).map_err(|e|e.to_string())?; if n==0 {break}
        let Some(data)=line.trim().strip_prefix("data: ") else {continue};
        if data=="[DONE]" {break}
        if let Ok(json)=serde_json::from_str::<serde_json::Value>(data){
            if let Some(chunk)=json["choices"][0]["delta"]["content"].as_str(){
                output.push_str(chunk);token(chunk);
            }
        }
    }
    if output.is_empty(){return Err("Model streamed no content".into())}
    Ok(output)
}
pub struct AnalysisResult {pub facts:String,pub summary:String}
pub fn analyze(text:&str,mut update:impl FnMut(&str,&str))->Result<AnalysisResult,String>{
    let input=chunks(text,11500);let total=input.len();
    let mut first=String::new();
    for (i,chunk) in input.iter().enumerate() {
        update("status",&format!("Pass 1 / {} of {} text sections",i+1,total));
        let prompt=format!("Extract a STRICT JSON object from source section {} of {} with keys: claimant_name, date_of_birth, diagnoses (array with documented ICD codes or null), work_history, functional_limitations, objective_findings, medication, dates, source_citations, uncertain_or_missing. Use null for unavailable values. Page citations required. SOURCE:\n{}",i+1,total,chunk);
        let facts=complete(&prompt)?;
        first.push_str(&format!("SECTION {}\n{}\n",i+1,facts)); update("facts",&first);
    }
    let mut summaries=String::new();
    for (i,chunk) in input.iter().enumerate() {
        update("status",&format!("Pass 2 / {} of {} text sections",i+1,total));
        let prompt=format!("Produce a thorough structured clinical/functional summary exactly with: executive summary; chronology; diagnoses with supporting evidence; objective testing; functional limitations (separate self-report and observed); treatment; contradictory evidence; documentation gaps; and implications for a possible disability application. Do not decide SSA eligibility. Cite [Page #] for each material claim. Section {} of {}.\nSOURCE:\n{}",i+1,total,chunk);
        let part=stream(&prompt,|token|{summaries.push_str(token);update("summary",&summaries)})?;
        let _=part;
        summaries.push_str("\n\n---\n\n");
        update("summary",&summaries);
    }
    if total>1 {
        update("status","Consolidating document sections...");
        let consolidation=complete(&format!("Consolidate these section summaries into one comprehensive, accurately cited medical summary without inventing facts. Explicitly preserve contradictions and missing evidence:\n{}",summaries.chars().take(16000).collect::<String>()))?;
        summaries.push_str("\n\n## Consolidated document assessment\n");
        summaries.push_str(&consolidation);update("summary",&summaries);
    }
    Ok(AnalysisResult{facts:first,summary:summaries})
}
pub fn disability_narrative(artifacts:&str,mut update:impl FnMut(&str))->Result<String,String>{
    let prompt=format!("Write a balanced disability evidence narrative from these stored artifacts. Include: medical longitudinal evidence, work-related functional restrictions, duration, supportive evidence, contrary evidence, gaps/ambiguities, and one conclusion exactly chosen from SUPPORTS / DOES NOT SUPPORT / INSUFFICIENT EVIDENCE, with reasons. Explicitly distinguish clinical documentation from SSA adjudication; cite original page references where available. Do not invent facts.\n{}",artifacts.chars().take(19000).collect::<String>());
    stream(&prompt,|s|update(s))
}
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn splits_unicode_without_losing_text() {
        let original="á🙂汉字".repeat(20);
        assert_eq!(chunks(&original,11).concat(),original);
    }
}
