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
                         "blob_metadata","submitted_packets","audit_events","schema_migrations"):
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

    def test_statuses_enforced(self):
        self.db.execute("INSERT INTO principals VALUES ('staff','Synthetic Staff','active','now')")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO cases(case_id,status,opened_at,owner_principal_id,created_at,updated_at) VALUES ('x','auto_denied','now','staff','now','now')")

if __name__=="__main__":
    unittest.main()
