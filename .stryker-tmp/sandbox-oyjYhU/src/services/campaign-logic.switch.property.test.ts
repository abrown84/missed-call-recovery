/**
 * Staging evidence (c) invariant: Standard→Emergency switch (and first-reply
 * Emergency enroll) must schedule Emergency step 1 immediately — recovery SMS
 * is not a substitute for the Emergency initial.
 */
// @ts-nocheck

import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { planEnrollmentStart } from './campaign-logic';

const emergencySteps = [
  { step_number: 1, delay_minutes: 0, template_key: 'emergency_initial' },
  { step_number: 2, delay_minutes: 60, template_key: 'emergency_followup_1' },
  { step_number: 3, delay_minutes: 180, template_key: 'emergency_followup_2' },
];

const highSteps = [
  { step_number: 1, delay_minutes: 0, template_key: 'high_initial' },
  { step_number: 2, delay_minutes: 120, template_key: 'high_followup_1' },
];

describe('staging (c) property: urgency campaigns never skip step 1 for recovery', () => {
  it('for any recoveryAlreadySent, treatRecoveryAsInitial:false → step 1 now', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (recoverySent, isEmergency) => {
        const steps = isEmergency ? emergencySteps : highSteps;
        const plan = planEnrollmentStart(steps, {
          recoveryAlreadySent: recoverySent,
          treatRecoveryAsInitial: false, // switch / urgency enroll
          now: new Date('2026-10-28T15:00:00.000Z'),
        });
        expect(plan.currentStep).toBe(1);
        expect(plan.skippedInitial).toBe(false);
        expect(plan.nextSendAt.getTime()).toBe(
          new Date('2026-10-28T15:00:00.000Z').getTime()
        );
      }),
      { numRuns: 40 }
    );
  });

  it('Standard still skips delay-0 when recovery sent', () => {
    const std = [
      { step_number: 1, delay_minutes: 0, template_key: 'standard_initial' },
      { step_number: 2, delay_minutes: 240, template_key: 'standard_followup_1' },
    ];
    const plan = planEnrollmentStart(std, {
      recoveryAlreadySent: true,
      treatRecoveryAsInitial: true,
      now: new Date('2026-10-28T15:00:00.000Z'),
    });
    expect(plan.currentStep).toBe(2);
    expect(plan.skippedInitial).toBe(true);
  });
});
