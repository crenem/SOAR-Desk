/** Common privacy-mode gate for every local analysis backend.
 * Restricted local cases must never be mislabeled as synthetic requests. */
export type AnalysisMode={synthetic_confirmed:boolean;local_risk_acknowledged:boolean};
export function analysisMode(syntheticOnly:boolean):AnalysisMode {
 return {synthetic_confirmed:syntheticOnly,local_risk_acknowledged:!syntheticOnly};
}
