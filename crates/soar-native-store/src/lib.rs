//! Local SQLite repository for SOAR Desk. The database is authoritative;
//! imported files are immutable content-addressed blobs stored beside it.
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fs, io, path::{Path, PathBuf}, time::{SystemTime, UNIX_EPOCH}};

#[derive(Debug)]
pub enum StoreError {
    Sql(rusqlite::Error),
    Io(io::Error),
    Json(serde_json::Error),
    Conflict { expected: i64, actual: i64 },
    InvalidField,
}
impl From<rusqlite::Error> for StoreError { fn from(e: rusqlite::Error) -> Self { Self::Sql(e) } }
impl From<io::Error> for StoreError { fn from(e: io::Error) -> Self { Self::Io(e) } }
impl From<serde_json::Error> for StoreError { fn from(e: serde_json::Error) -> Self { Self::Json(e) } }
pub type Result<T> = std::result::Result<T, StoreError>;

fn now() -> i64 { SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs() as i64 }

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct FieldValue { pub value: serde_json::Value, pub revision: i64, pub origin: String, pub updated_at: i64 }
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Artifact { pub id: i64, pub case_id: i64, pub document_id: Option<i64>, pub kind: String, pub version: i64, pub status: String, pub body: String }
pub struct Store { db: Connection, vault: PathBuf }

impl Store {
    pub fn open(root: impl AsRef<Path>) -> Result<Self> {
        let root = root.as_ref();
        fs::create_dir_all(root)?;
        let vault = root.join("vault");
        fs::create_dir_all(&vault)?;
        let db = Connection::open(root.join("soar.db"))?;
        db.busy_timeout(std::time::Duration::from_secs(5))?;
        db.pragma_update(None, "journal_mode", "WAL")?;
        db.pragma_update(None, "synchronous", "FULL")?;
        db.pragma_update(None, "foreign_keys", "ON")?;
        db.execute_batch(r#"
            CREATE TABLE IF NOT EXISTS cases (
                id INTEGER PRIMARY KEY, title TEXT NOT NULL, created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS fields (
                case_id INTEGER NOT NULL REFERENCES cases(id), field_key TEXT NOT NULL,
                value_json TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
                origin TEXT NOT NULL, updated_at INTEGER NOT NULL,
                PRIMARY KEY(case_id, field_key)
            );
            CREATE TABLE IF NOT EXISTS field_history (
                id INTEGER PRIMARY KEY, case_id INTEGER NOT NULL, field_key TEXT NOT NULL,
                old_json TEXT, new_json TEXT NOT NULL, revision INTEGER NOT NULL,
                origin TEXT NOT NULL, changed_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS documents (
                id INTEGER PRIMARY KEY, case_id INTEGER NOT NULL REFERENCES cases(id),
                filename TEXT NOT NULL, sha256 TEXT NOT NULL, mime TEXT NOT NULL,
                vault_path TEXT NOT NULL, imported_at INTEGER NOT NULL,
                UNIQUE(case_id, sha256)
            );
            CREATE TABLE IF NOT EXISTS artifacts (
                id INTEGER PRIMARY KEY, case_id INTEGER NOT NULL REFERENCES cases(id),
                document_id INTEGER REFERENCES documents(id), kind TEXT NOT NULL,
                version INTEGER NOT NULL, status TEXT NOT NULL, body TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                UNIQUE(case_id, document_id, kind, version)
            );
            CREATE TABLE IF NOT EXISTS jobs (
                id INTEGER PRIMARY KEY, case_id INTEGER NOT NULL REFERENCES cases(id),
                document_id INTEGER REFERENCES documents(id),
                stage TEXT NOT NULL, status TEXT NOT NULL, partial_output TEXT NOT NULL DEFAULT '',
                updated_at INTEGER NOT NULL
            );
        "#)?;
        Ok(Self { db, vault })
    }
    pub fn create_case(&self, title: &str) -> Result<i64> {
        self.db.execute("INSERT INTO cases(title, created_at) VALUES(?1, ?2)", params![title, now()])?;
        Ok(self.db.last_insert_rowid())
    }
    pub fn get_field(&self, case_id: i64, key: &str) -> Result<Option<FieldValue>> {
        let row: Option<(String,i64,String,i64)> = self.db.query_row(
            "SELECT value_json,revision,origin,updated_at FROM fields WHERE case_id=?1 AND field_key=?2",
            params![case_id,key], |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))
        ).optional()?;
        row.map(|(value,revision,origin,updated_at)| Ok(FieldValue {value:serde_json::from_str(&value)?,revision,origin,updated_at})).transpose()
    }
    /// Commit one dirty field using optimistic revision control. Call on blur
    /// and after idle debounce. A stale write never overwrites newer input.
    pub fn save_field(&mut self, case_id:i64, key:&str, value:&serde_json::Value, expected_revision:i64, origin:&str) -> Result<i64> {
        if key.trim().is_empty() || origin.trim().is_empty() { return Err(StoreError::InvalidField); }
        let tx = self.db.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let existing: Option<(String,i64)> = tx.query_row(
            "SELECT value_json,revision FROM fields WHERE case_id=?1 AND field_key=?2",
            params![case_id,key], |r| Ok((r.get(0)?,r.get(1)?))
        ).optional()?;
        let actual = existing.as_ref().map(|x|x.1).unwrap_or(0);
        if actual != expected_revision { return Err(StoreError::Conflict {expected:expected_revision,actual}); }
        let new_revision = actual + 1;
        let encoded = serde_json::to_string(value)?;
        tx.execute("INSERT INTO fields(case_id,field_key,value_json,revision,origin,updated_at)
            VALUES(?1,?2,?3,?4,?5,?6)
            ON CONFLICT(case_id,field_key) DO UPDATE SET value_json=excluded.value_json,
            revision=excluded.revision,origin=excluded.origin,updated_at=excluded.updated_at",
            params![case_id,key,encoded,new_revision,origin,now()])?;
        tx.execute("INSERT INTO field_history(case_id,field_key,old_json,new_json,revision,origin,changed_at)
            VALUES(?1,?2,?3,?4,?5,?6,?7)",
            params![case_id,key,existing.map(|x|x.0),encoded,new_revision,origin,now()])?;
        tx.commit()?;
        Ok(new_revision)
    }
    /// Store original bytes before recording the document. Existing imports
    /// remain untouched; duplicate case uploads return the existing ID.
    pub fn import_document(&mut self, case_id:i64, filename:&str, mime:&str, bytes:&[u8]) -> Result<i64> {
        let hash = format!("{:x}",Sha256::digest(bytes));
        let path = self.vault.join(&hash);
        if !path.exists() {
            let tmp = self.vault.join(format!("{hash}.partial"));
            fs::write(&tmp,bytes)?;
            fs::rename(tmp,&path)?;
        }
        self.db.execute("INSERT OR IGNORE INTO documents(case_id,filename,sha256,mime,vault_path,imported_at)
            VALUES(?1,?2,?3,?4,?5,?6)",
            params![case_id,filename,hash,mime,path.to_string_lossy().as_ref(),now()])?;
        let id = self.db.query_row("SELECT id FROM documents WHERE case_id=?1 AND sha256=?2",
            params![case_id,hash],|r|r.get(0))?;
        Ok(id)
    }
    pub fn add_artifact(&mut self,case_id:i64,document_id:Option<i64>,kind:&str,status:&str,body:&str)->Result<Artifact>{
        let tx=self.db.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let version:i64=tx.query_row(
            "SELECT COALESCE(MAX(version),0)+1 FROM artifacts WHERE case_id=?1 AND document_id IS ?2 AND kind=?3",
            params![case_id,document_id,kind],|r|r.get(0))?;
        tx.execute("INSERT INTO artifacts(case_id,document_id,kind,version,status,body,created_at)
            VALUES(?1,?2,?3,?4,?5,?6,?7)",params![case_id,document_id,kind,version,status,body,now()])?;
        let id=tx.last_insert_rowid();
        tx.commit()?;
        Ok(Artifact{id,case_id,document_id,kind:kind.into(),version,status:status.into(),body:body.into()})
    }
    pub fn recent_case(&self) -> Result<Option<(i64, String)>> {
        Ok(self.db.query_row("SELECT id,title FROM cases ORDER BY id DESC LIMIT 1", [], |r| Ok((r.get(0)?,r.get(1)?))).optional()?)
    }
    pub fn documents(&self, case_id:i64) -> Result<Vec<(i64, String, String)>> {
        let mut q=self.db.prepare("SELECT id,filename,vault_path FROM documents WHERE case_id=?1 ORDER BY id DESC")?;
        let rows=q.query_map([case_id],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?)))?;
        Ok(rows.collect::<std::result::Result<Vec<_>,_>>()?)
    }
    /// Checkpoint the live job without replacing completed artifacts.
    pub fn checkpoint_job(&self,case_id:i64,document_id:i64,stage:&str,status:&str,partial:&str)->Result<()> {
        self.db.execute("INSERT INTO jobs(case_id,document_id,stage,status,partial_output,updated_at) VALUES(?1,?2,?3,?4,?5,?6)",params![case_id,document_id,stage,status,partial,now()])?;
        Ok(())
    }
    pub fn artifacts(&self,case_id:i64)->Result<Vec<Artifact>> {
        let mut q=self.db.prepare("SELECT id,case_id,document_id,kind,version,status,body FROM artifacts WHERE case_id=?1 ORDER BY id")?;
        let rows=q.query_map([case_id],|r|Ok(Artifact{id:r.get(0)?,case_id:r.get(1)?,document_id:r.get(2)?,kind:r.get(3)?,version:r.get(4)?,status:r.get(5)?,body:r.get(6)?}))?;
        Ok(rows.collect::<std::result::Result<Vec<_>,_>>()?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn autosave_conflicts_and_persists() {
        let dir=tempfile::tempdir().unwrap();
        let mut store=Store::open(dir.path()).unwrap();
        let id=store.create_case("Jane").unwrap();
        assert_eq!(store.save_field(id,"dob",&serde_json::json!("1981-07-14"),0,"user").unwrap(),1);
        assert!(matches!(store.save_field(id,"dob",&serde_json::json!("2000-01-01"),0,"ai"),Err(StoreError::Conflict{..})));
        drop(store);
        let store=Store::open(dir.path()).unwrap();
        assert_eq!(store.get_field(id,"dob").unwrap().unwrap().value,serde_json::json!("1981-07-14"));
    }
    #[test]
    fn imports_are_deduplicated_and_artifacts_versioned() {
        let dir=tempfile::tempdir().unwrap();
        let mut store=Store::open(dir.path()).unwrap();
        let id=store.create_case("Jane").unwrap();
        let doc=store.import_document(id,"a.pdf","application/pdf",b"fixture").unwrap();
        assert_eq!(doc,store.import_document(id,"again.pdf","application/pdf",b"fixture").unwrap());
        assert_eq!(store.add_artifact(id,Some(doc),"summary","final","first").unwrap().version,1);
        assert_eq!(store.add_artifact(id,Some(doc),"summary","final","second").unwrap().version,2);
        assert_eq!(store.artifacts(id).unwrap().len(),2);
    }
}
