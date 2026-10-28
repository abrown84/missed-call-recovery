/**
 * Campaign enrollment / send / cron — barrel re-exports.
 * Implementation lives in campaigns-impl.ts (mutated, DI-tested).
 */
export {
  type EnrollmentResult,
  type ReconcileResult,
  enrollLeadInCampaign,
  switchEnrollmentCampaign,
  handleClassifiedReplyEnrollment,
  getEnrollmentForLead,
  sendCampaignSMS,
  advanceEnrollment,
  pauseCampaignForLead,
  leadHasActiveEnrollment,
  claimDueEnrollment,
  listClaimableEnrollmentIds,
  reconcileAmbiguousSms,
  processDueCampaigns,
} from './campaigns-impl';
