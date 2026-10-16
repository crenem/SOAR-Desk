-- SCHEMA V1. Encrypted SQLCipher only. A plaintext SQLite database must NEVER
-- be opened by the production repository adapter.
PRAGMA foreign_keys = ON;
CREATE TABLE schema_migrations (
 version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL, file_checksum TEXT NOT NULL
);
CREATE TABLE vault_metadata (
 id INTEGER PRIMARY KEY CHECK(id=1), vault_uuid TEXT NOT NULL,
 schema_version INTEGER NOT NULL CHECK(schema_version>=1),
 cipher_version TEXT NOT NULL, key_identifier TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE principals (
 principal_id TEXT PRIMARY KEY, display_name TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('active','suspended','revoked')), created_at TEXT NOT NULL
);
CREATE TABLE roles (role_id TEXT PRIMARY KEY, title TEXT NOT NULL);
CREATE TABLE principal_roles (
 principal_id TEXT NOT NULL REFERENCES principals(principal_id),
 role_id TEXT NOT NULL REFERENCES roles(role_id),
 PRIMARY KEY(principal_id,role_id)
);
CREATE TABLE cases (
 case_id TEXT PRIMARY KEY,
 status TEXT NOT NULL CHECK(status IN ('preparation','evidence_development','filed','appealing','closed')),
 opened_at TEXT NOT NULL, closed_at TEXT,
 owner_principal_id TEXT NOT NULL REFERENCES principals(principal_id),
 profile_json TEXT NOT NULL DEFAULT '{}',
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE case_access (
 case_id TEXT NOT NULL REFERENCES cases(case_id),
 principal_id TEXT NOT NULL REFERENCES principals(principal_id),
 permission TEXT NOT NULL CHECK(permission IN ('read','write','review','admin')),
 granted_by TEXT NOT NULL REFERENCES principals(principal_id),
 granted_at TEXT NOT NULL, revoked_at TEXT,
 PRIMARY KEY(case_id,principal_id)
);
CREATE TABLE case_programs (
 case_id TEXT NOT NULL REFERENCES cases(case_id),
 program TEXT NOT NULL CHECK(program IN ('ssi','ssdi')),
 PRIMARY KEY(case_id,program)
);
CREATE TABLE form_instances (
 instance_id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases(case_id),
 form_id TEXT NOT NULL, edition TEXT NOT NULL, source_pdf_sha256 TEXT,
 workflow_state TEXT NOT NULL CHECK(workflow_state IN ('draft','review','signed_externally','filed_externally')),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE evidence_sources (
 evidence_id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases(case_id),
 source_kind TEXT NOT NULL, source_location TEXT,
 review_state TEXT NOT NULL CHECK(review_state IN ('pending','human_verified','rejected')),
 reviewed_by TEXT REFERENCES principals(principal_id), reviewed_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE field_answers (
 answer_id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases(case_id),
 form_instance_id TEXT REFERENCES form_instances(instance_id),
 canonical_key TEXT NOT NULL, question_reference TEXT NOT NULL,
 answer_state TEXT NOT NULL CHECK(answer_state IN ('not_asked','unknown','reported','verified','clarify','not_applicable')),
 value_json TEXT, evidence_id TEXT REFERENCES evidence_sources(evidence_id),
 assertion_source TEXT, entered_by TEXT NOT NULL REFERENCES principals(principal_id),
 reviewed_by TEXT REFERENCES principals(principal_id),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX idx_answers_case_key ON field_answers(case_id,canonical_key);
CREATE TABLE blob_metadata (
 blob_id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases(case_id),
 source_filename TEXT NOT NULL, mime_type TEXT NOT NULL,
 plaintext_sha256 TEXT NOT NULL, content_length INTEGER NOT NULL CHECK(content_length>=0),
 encryption_algorithm TEXT NOT NULL, encryption_key_id TEXT NOT NULL,
 added_at TEXT NOT NULL, added_by TEXT NOT NULL REFERENCES principals(principal_id)
);
CREATE TABLE evidence_documents (
 evidence_id TEXT NOT NULL REFERENCES evidence_sources(evidence_id),
 blob_id TEXT NOT NULL REFERENCES blob_metadata(blob_id),
 PRIMARY KEY(evidence_id,blob_id)
);
CREATE TABLE submitted_packets (
 packet_id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases(case_id),
 destination TEXT NOT NULL, channel TEXT NOT NULL, purpose TEXT NOT NULL,
 staff_reported_submission_at TEXT, independently_checked_receipt_at TEXT,
 externally_issued_reference TEXT, reported_by TEXT REFERENCES principals(principal_id),
 verified_by TEXT REFERENCES principals(principal_id)
);
CREATE TABLE audit_events (
 sequence_id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL UNIQUE,
 case_id TEXT REFERENCES cases(case_id), actor_id TEXT NOT NULL,
 action TEXT NOT NULL, object_type TEXT NOT NULL, object_id TEXT NOT NULL,
 happened_at TEXT NOT NULL, prev_chain_hash TEXT, chain_hash TEXT NOT NULL,
 event_digest TEXT NOT NULL
);
-- Tampering by database administrators is NOT prevented by SQL triggers.
-- Production audit integrity needs keyed chaining and independent anchoring.
CREATE TRIGGER audit_update_guard BEFORE UPDATE ON audit_events
 BEGIN SELECT RAISE(ABORT, 'audit events cannot be updated'); END;
CREATE TRIGGER audit_delete_guard BEFORE DELETE ON audit_events
 BEGIN SELECT RAISE(ABORT, 'audit events cannot be deleted'); END;
