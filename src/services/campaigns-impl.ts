/**
 * Campaign I/O shell — thin re-exports of the DI runtime.
 * Implementation lives in campaign-runtime.ts (mutated + DI-tested).
 */
export {
  type EnrollmentResult,
  type ReconcileResult,
  type CampaignDeps,
  defaultCampaignDeps,
  enrollLeadInCampaign,
  enrollLeadInCampaignWithDeps,
  switchEnrollmentCampaign,
  switchEnrollmentCampaignWithDeps,
  handleClassifiedReplyEnrollment,
  handleClassifiedReplyEnrollmentWithDeps,
  getEnrollmentForLead,
  getEnrollmentForLeadWithDeps,
  sendCampaignSMS,
  sendCampaignSMSWithDeps,
  advanceEnrollment,
  pauseCampaignForLead,
  pauseCampaignForLeadWithDeps,
  leadHasActiveEnrollment,
  claimDueEnrollment,
  claimDueEnrollmentWithDeps,
  listClaimableEnrollmentIds,
  listClaimableEnrollmentIdsWithDeps,
  reconcileAmbiguousSms,
  reconcileAmbiguousSmsWithDeps,
  processDueCampaigns,
  processDueCampaignsWithDeps,
} from './campaign-runtime';
