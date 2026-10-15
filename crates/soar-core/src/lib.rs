//! SOAR Desk's framework-neutral core.
//!
//! No automated SSA eligibility decisions or service denials are possible.

pub mod screening;

pub use screening::{
    AdultReferralScreen, EvidenceKind, EvidenceSource, EvidenceStatus, Finding,
    FunctionalDomain, FunctionalFinding, HumanReview, ScreeningRecommendation,
    ServiceDecision, TriageStatus, ValidationError,
};
