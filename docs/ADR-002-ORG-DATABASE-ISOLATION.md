# ADR-002 — Firestore Organization Directory + Dedicated Organization Databases

**Decision:** Approved architectural direction (2026-10-19). **Implementation:** Planned, not deployed. This document does not authorize real PHI processing.

## Architecture

The Firestore **(default)** database is the central **control plane** for organizations, memberships, seat allocation, billing entitlements and tenant routing. Every organization receives a separate **named Firestore Native database instance** for its applicant/case data. An organization DB is a separate database resource, NOT a collection within (default).

~~~text
GCP: Inimetrica control-plane project
Firestore database: (default)
└── Organizations/                           # collection
    └── {organizationId}/                    # document: org config
        ├── organizationDbId                 # e.g. org-a7k39m8x
        ├── organizationProjectId            # owning GCP project; permits sharding
        ├── region / state / schemaVersion   # e.g. provisioning, active, suspended
        ├── subscriptionId / plan / seatCount
        └── users/                           # organization membership subcollection
            └── {userId}/
                ├── role / teams / status
                ├── seatId / joinedAt / revokedAt
                └── invitation and membership metadata

GCP: Inimetrica organization data-plane project
Firestore database: {organizationDbId}      # separate named database
├── applicantRecords/{applicantId}
├── cases/{caseId}
│   ├── grants/{userId}
│   ├── applications/{applicationId}
│   ├── interviews/{interviewId}
│   ├── forms/{formId}
│   ├── evidence/{evidenceId}
│   ├── aiProposals/{proposalId}
│   ├── tasks/{taskId}
│   └── submissions/{submissionId}
├── providers/{providerId}
└── auditEvents/{eventId}
~~~

Additional optional (default) collection: userMembershipIndex/{userId}, storing *only* opaque org IDs to support organization selection. This is not an authorization source. No client names, SSNs, PHI, case titles, evidence contents, or client-identifying metadata in (default), Stripe metadata, authentication claims or generalized logs.

## Tenant resolution and security

1. Validate ZITADEL OIDC signature, issuer, subject, audience, expiry and session.
2. Resolve requested organization ID in (default)/Organizations/{orgId}, and verify the actor against that organization's users/{userId}. Membership must be active with appropriate seat/role and organization state. Organization administrators and billing administrators do not automatically gain case access.
3. Server reads the *authoritative stored* organizationProjectId/organizationDbId mapping. **Ignore any client-supplied database/project ID, collection path or Storage bucket**. Verify mapping against allowlisted Inimetrica data-plane projects and tenant registry.
4. An authenticated Cloud Run backend resolves the named database and evaluates independent case/evidence grants for every read, mutation, search, download, agent retrieval, fax/EHR operation or export. Request-scoped tenant context is immutable.
5. Prefer server-mediated access only for named databases. Configure deny-by-default Firestore client rules, IAM Conditions scoped to databases/service accounts where feasible and separate operating/provisioning permissions. **Server SDKs bypass Firebase Security Rules**; the backend must implement authorization, and a highly privileged compromised account could otherwise access multiple databases.
6. Each organization has separately governed encrypted Cloud Storage evidence (prefer dedicated bucket or equivalently robust storage/IAM segmentation), retention, backup/restore, encryption/key controls, logs and incident handling.
7. Never use a subscription failure to delete records or block authorized continuity/export. Cross-organization case sharing is disabled in v1; future authorized exchange uses an explicit audited export/import path.

Illustrative backend routing; pseudocode only:

~~~typescript
const actor = await verifyOidc(request);
const membership = await controlDb.getMembership(orgId, actor.userId);
authorizeOrganization(membership, "case:read");
const tenant = await controlDb.getActiveOrgTenantBinding(orgId);
const caseDb = tenantDatabaseFactory.get(tenant.organizationProjectId, tenant.organizationDbId);
const grant = await caseDb.getGrant(caseId, actor.userId);
authorizeCase(grant, "case:read");
return caseDb.readCase(caseId);
~~~

## Database provisioning lifecycle

Lifecycle: requested → provisioning → securing → schema-initializing → active; on failures status remains failed with deterministic retries and manual reconciliation.

Provisioner reserves a unique org ID in (default), chooses project/region and an opaque lower-case named Firestore database ID (letters/digits/hyphens, 4–63 characters, not UUID-like), then creates the database with **delete protection enabled**. Apply schema/indexes, restrictive client rules, IAM, backup/PITR, storage policy, and tenant isolation smoke tests *before* activating the organization record. Only a narrowly privileged provisioner may create/delete databases. Billing customer onboarding must not automatically produce a live, partially configured tenant.

Named databases have no free tier (charged for use); assess backup/PITR and storage charges by organization. Location cannot be changed after creation. Firestore's documented default limit is **100 databases per GCP project**, with support-request increases. Architect multiple data-plane GCP projects at inception; use one shared control plane and store project ID alongside database ID, so 3,000 paid seats can represent more than 100 organizations without redesigning the directory. Cross-database transactions are *not atomic*; use idempotent provisioning and outbox/saga patterns to reconcile central seat states against tenant operations. Cloud Functions v1 triggers don't support named databases: use supported 2nd-gen/Cloud Run event flows.

### Legacy CareBase migration

CareBase currently refers to a former organization project and named Firestore database. The new Inimetrica (default) and organization databases must start **empty**, contain **synthetic data only**, and have no previous-employer accounts/records/configuration copied over. Refactor CareBase code into separate getControlPlaneDb() and getVerifiedOrganizationDb(tenantContext) APIs; do not reuse its broad inherited participant and Storage rules. Remove legacy defaults and credential fallbacks prior to any staging deployment.

## Release acceptance tests

- Nonmember, revoked member, billing admin and wrong-org user cannot access any client case or database (including guessed project/database ID, parallel/concurrent requests and AI retrieval).
- Only explicit, verified case grants permit case access; account/seat/billing claims from client cannot escalate.
- Newly provisioned DB cannot become active without deny-by-default rules, scoped backend IAM, indexes, integrity checks, backup configuration and successful tenant-isolation tests.
- Backup and restore for one org cannot overwrite another org's database; deletion protection and lawful offboarding tested.
- Cancellation leaves all case data accessible for authorized retention/export, not immediate deletion.
- All case and evidence operations use correct tenant context, scoped audit and no PHI in control-plane metrics or Stripe.
- Provisioning/teardown is idempotent; monitoring alerts on cost and impending per-project database limit.
- PHI blocked until contractual BAAs, independent security review, least-privilege verification and organizational compliance controls have been completed.

## References

- https://firebase.google.com/docs/firestore/manage-databases
- https://docs.cloud.google.com/firestore/quotas
- https://cloud.google.com/firestore/pricing
- https://docs.cloud.google.com/firestore/docs/locations
- https://firebase.google.com/docs/firestore/security/iam
- https://firebase.google.com/docs/reference/admin/node/firebase-admin.firestore

**Rationale:** A central directory preserves efficient organization/seat administration while dedicated named databases enforce a clearer data lifecycle and isolation boundary for each customer. This adds provisioning, per-DB schema/index/backup management, cross-database coordination and sharding complexity, but directly supports product trust and separate organization export/recovery.
