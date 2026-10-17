# ZITADEL Federation — SOAR Desk

Status: **implemented native OIDC authorization-code + PKCE integration for development testing; not production-certified.** No ZITADEL instance, organization, app or credentials are bundled into SOAR Desk. You must create an identity-provider application before federated sign-in can be exercised.

## 1. Create ZITADEL tenant/project and Native application

1. Sign up for ZITADEL Cloud or self-host a current supported release. Choose and secure your own HTTPS issuer origin, e.g. `https://example.zitadel.cloud`.
2. In the ZITADEL Console, create a **Project** named SOAR Desk (or your organization's preferred project). Under it, create a **Native** OIDC application (not a web app, API app or SPA).
3. Use **Authorization Code / PKCE** for user login. No static client secret is stored in SOAR Desk.
4. Register the exact redirect URI:

   `http://127.0.0.1:8765/callback`

   ZITADEL strictly matches registered redirect URIs. Enable development mode if needed to allow an HTTP loopback redirect; never enable insecure non-loopback production callbacks. This is a local receiver bound to `127.0.0.1`, not a publicly hosted endpoint.
5. Copy the **Client ID** and HTTPS issuer origin from the console. You need only these public configuration values; never paste a client secret into SOAR Desk.
6. Ensure the ZITADEL account you plan to link has the appropriate multifactor / passkey policy. ZITADEL handles browser authentication, not SOAR Desk's embedded WebView.

Reference: [ZITADEL applications and native PKCE](https://zitadel.com/docs/guides/manage/console/applications-overview) and [OIDC endpoints](https://zitadel.com/docs/apis/openidoauth/endpoints).

## 2. Link an existing local operator profile

1. Update SOAR Desk to the latest `main` and launch the Windows CUDA desktop shortcut.
2. **Sign in with the existing offline local username/password**. New installations first enroll a local operator with a 16+ character password.
3. In the left panel, open **Profile & ZITADEL**.
4. Enter the issuer origin and Native application Client ID. Click **Save ZITADEL settings**.
5. Click **Link ZITADEL account**. A system browser should open the ZITADEL login, using PKCE, state and nonce.
6. After completing authentication, the browser receives a one-time localhost callback. Return to SOAR Desk to see the linking result. If the browser does not open, use **Copy sign-in URL** and open it manually.
7. Sign out with **Lock SOAR Desk**, then choose **Sign in with ZITADEL**. Only the same verified issuer + stable OIDC `sub` linked in step 6 may unlock that local profile. An email match is **never** sufficient.

Federated login creates **no new SOAR Desk operator automatically**. It binds to the pre-existing SOAR Desk profile ID, while the application maintains its own case assignments and permissions in future iterations.

## 3. Threat model and present limitations

- **Browser flow:** Standard OIDC code flow with PKCE S256, cryptographically random state and nonce, issuer/client checks through discovery, verified signed ID token with audience, issuer, expiration and nonce. The loopback receiver validates its state before accepting the authorization code. The pending transaction is single use and expires after three minutes. Redirects are disabled during provider discovery/token exchange.
- **No secrets on disk:** The app stores only issuer and public client ID in `~/.config/soar-desk/zitadel.json`. An explicit linked identity is stored under `oidc_links` in the protected local operator profile. OAuth codes, ID tokens, access tokens and refresh tokens are **not** stored. A browser may use its own IdP cookies.
- **Offline availability:** Local username/password login continues working without ZITADEL. If the network or IdP fails, this prototype does not bypass the normal local-credential gate or decrypt any case automatically.
- **Case encryption:** ZITADEL authentication never derives or exposes the per-case AES-256-GCM encryption key. You still need the encrypted case's distinct practitioner passphrase; the nonprofit recovery passphrase remains separately managed.
- **One operator:** Only one local operator profile currently exists per Ubuntu OS account. Shared-workstation isolation, organization directory sync, multi-user roles, authorized case assignments, client revocation and independent audit need additional design and verification.
- **Loopback:** `127.0.0.1:8765` must be unused, and the Windows browser must be able to connect to the Ubuntu WSL2 loopback listener. Windows-to-WSL localhost forwarding is normally supported, but WSL networking settings may affect it. The OIDC callback listener times out automatically.
- **Passkeys:** If ZITADEL authenticates the user through an IdP-supported passkey, that is **a passkey at the provider**, not a Windows-Hello-native key wrapping the local encrypted case. Such OS-backed case-key wrapping remains a separate milestone.
- **No credential revocation claims:** Existing unlocked native sessions expire after 15 minutes or lock; this version does not continuously validate provider sessions or revoke them remotely. Local account password access still exists.
- **Security scope:** No external security certification. Do not use real claimant PHI in this development build or assume Login.gov/SSA acceptance.

## 4. Synthetic acceptance checklist

1. Create a local fictitious operator. Confirm no ZITADEL button appears before configuring the issuer.
2. Configure an actual ZITADEL Native app and link a test ZITADEL account after local login. Confirm a stable SOAR profile ID remains unchanged.
3. Lock. With the linked ZITADEL account, federated login works; with a different ZITADEL account (even if it displays the same email), login is refused.
4. Cancel the provider consent or alter the returned `state`: login must be denied, without case access.
5. Close the browser / fail network: a timeout must not unlock anything and local offline sign-in must still work.
6. Sign in through ZITADEL, attempt to open a previously encrypted training case: a **separate case passphrase is still required**.
7. Run the GitHub native Tauri, desktop, Rust and inference checks on the **same commit** and complete a Windows/WSL2 hands-on test. The browser-to-WSL loopback flow requires actual local validation.

Use `docs/RELEASE-ACCEPTANCE-WINDOWS-CUDA.md` for the wider end-to-end case/evidence test.
