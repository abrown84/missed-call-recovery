/**
 * Pure cron / claim helpers for the campaigns I/O shell.
 */

export type DueProcessCounts = {
  processed: number;
  errors: number;
  skipped: number;
};

export function emptyDueCounts(): DueProcessCounts {
  return { processed: 0, errors: 0, skipped: 0 };
}

export function noteClaimSkip(counts: DueProcessCounts): DueProcessCounts {
  return { ...counts, skipped: counts.skipped + 1 };
}

export function noteSendSuccess(counts: DueProcessCounts): DueProcessCounts {
  return { ...counts, processed: counts.processed + 1 };
}

export function noteSendFailure(counts: DueProcessCounts): DueProcessCounts {
  return { ...counts, errors: counts.errors + 1 };
}

export function decideClaimTokenResult(input: {
  dueError: boolean;
  dueCount: number;
  staleError: boolean;
  staleCount: number;
  token: string;
}): string | null {
  if (!input.dueError && input.dueCount > 0) return input.token;
  if (!input.staleError && input.staleCount > 0) return input.token;
  return null;
}

export function staleClaimCutoffIso(nowMs: number, staleMs: number): string {
  return new Date(nowMs - staleMs).toISOString();
}

export type AbandonedSidKind = 'campaign' | 'recovery' | 'other';

export function noteExtraRequeue(
  current: number,
  ok: boolean
): number {
  return ok ? current + 1 : current;
}
