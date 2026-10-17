/* Static policy regression for production IPC access checks.
 * Complements Rust Argon2id verifier tests; not a penetration test. */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.join(__dirname,"..");
const native=fs.readFileSync(path.join(root,"src-tauri/src/vault_commands.rs"),"utf8");
const api=fs.readFileSync(path.join(root,"src-tauri/src/lib.rs"),"utf8");
const auth=fs.readFileSync(path.join(root,"src-tauri/src/operator_auth.rs"),"utf8");
const app=fs.readFileSync(path.join(root,"src/App.tsx"),"utf8");
const ops=[
"attach_evidence_document","export_evidence_document","verify_attached_evidence",
"list_case_evidence","synthetic_autosave_status","autosave_synthetic_case",
"create_synthetic_vault","open_synthetic_vault","backup_synthetic_vault","recover_synthetic_vault"
];
for(const name of ops){
 const start=native.indexOf("pub fn "+name+"(");
 assert.ok(start>=0,"Missing "+name);
 const open=native.indexOf("{",start);
 assert.match(native.slice(open+1,open+130),/enforce_operator\(\)\?/,"Missing native auth gate for "+name);
}
for(const name of ["evaluate_screen","validate_human_review","extract_synthetic_document","classify_synthetic_text","extract_qwen_candidates","export_synthetic_draft","export_synthetic_ssa16_pdf","export_local_ssa16_working_pdf"]){
 const start=api.indexOf("fn "+name+"(");
 assert.ok(start>=0,"Missing IPC handler "+name);
 const open=api.indexOf("{",start);
 assert.match(api.slice(open+1,open+130),/operator_auth::require_operator\(\)\?/,"Missing native gate for "+name);
}
for(const endpoint of ["operator_status","enroll_operator","login_operator","logout_operator"]){
 assert.ok(api.includes("operator_auth::"+endpoint),"Unregistered account IPC: "+endpoint);
}
assert.match(auth,/PasswordHash::new/);
assert.match(auth,/Argon2::default\(\)\.hash_password/);
assert.match(auth,/LOCKOUT_SECONDS/);
assert.match(auth,/IDLE_SECONDS/);
assert.match(app,/OperatorGate/);
const zitadel=fs.readFileSync(path.join(root,"src-tauri/src/zitadel_oidc.rs"),"utf8");
for(const sourceName of ["begin_zitadel_auth","zitadel_auth_progress","complete_zitadel_auth","configure_zitadel"]){
 assert.ok(api.includes("zitadel_oidc::"+sourceName),"Missing OIDC native route: "+sourceName);
}
for(const control of [
 "PkceCodeChallenge::new_random_sha256",
 "CsrfToken::new_random","Nonce::new_random",
 "token.claims(&verifier",
 "claims.subject().as_str()",
 "valid_issuer(", "127.0.0.1:8765",
 "state.as_deref()!=Some(expected_state)",
 "link_oidc_identity","login_linked_oidc"
]){
 assert.ok(zitadel.includes(control),"Missing ZITADEL security control: "+control);
}
assert.ok(auth.includes("oidc_links"),"Missing stable linked identities");
assert.ok(auth.includes("profile_id"),"Missing immutable local profile ID");
assert.ok(auth.includes("!stored.oidc_links.iter().any"),"Unlinked identities must be refused");
console.log("Native operator access gates and Argon2id enrollment wiring passed.");
