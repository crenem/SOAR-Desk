"""In-memory structural tests ONLY; never persist plaintext SSA client data."""
from pathlib import Path
import sqlite3
import unittest

SCHEMA=Path(__file__).resolve().parents[1] / "crates/soar-storage/migrations/0001_initial.sql"

class CaseVaultSchemaTests(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.executescript(SCHEMA.read_text(encoding="utf-8"))

    def tearDown(self):
        self.db.close()

    def test_case_tables_and_relational_boundaries(self):
        names={r[0] for r in self.db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        for required in ("cases","case_access","field_answers","form_instances","evidence_sources",
                         "blob_metadata","submitted_packets","audit_events","schema_migrations",
                         "authorizations","disclosure_events"):
            self.assertIn(required,names)
        self.assertEqual(self.db.execute("PRAGMA foreign_keys").fetchone()[0],1)
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO case_programs(case_id,program) VALUES('missing','ssi')")

    def test_audit_rows_cannot_be_edited_or_deleted_by_normal_sql(self):
        self.db.execute("""INSERT INTO audit_events
         (event_id,actor_id,action,object_type,object_id,happened_at,chain_hash,event_digest)
         VALUES ('evt1','synthetic-reviewer','create','case','synthetic-case','2026-10-16T10:00Z','testhash','testdigest')""")
        with self.assertRaisesRegex(sqlite3.DatabaseError,"cannot be updated"):
            self.db.execute("UPDATE audit_events SET action='modified' WHERE event_id='evt1'")
        with self.assertRaisesRegex(sqlite3.DatabaseError,"cannot be deleted"):
            self.db.execute("DELETE FROM audit_events WHERE event_id='evt1'")

    def test_sensitive_documents_default_restricted_and_consents_separate(self):
        cols={c[1]:c for c in self.db.execute("PRAGMA table_info(blob_metadata)")}
        self.assertIn("sensitivity", cols)
        self.assertEqual(cols["sensitivity"][4], "'restricted'")
        consent={c[1] for c in self.db.execute("PRAGMA table_info(authorizations)")}
        for field in ("scope_json","revoked_at","source_blob_id","review_state"):
            self.assertIn(field,consent)

    def test_statuses_enforced(self):
        self.db.execute("INSERT INTO principals VALUES ('staff','Synthetic Staff','active','now')")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO cases(case_id,status,opened_at,owner_principal_id,created_at,updated_at) VALUES ('x','auto_denied','now','staff','now','now')")

if __name__=="__main__":
    unittest.main()
