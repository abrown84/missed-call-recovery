/**
 * Real PGlite CAS: only one concurrent deferred → sending claim wins.
 */
import { describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

describe('deferred status CAS (PGlite)', () => {
  it('exactly one of two concurrent UPDATE claimers wins', async () => {
    const db = new PGlite();
    const sid = 'mlf:recovery:race-pglite';
    await db.exec(`
      CREATE TABLE sms_messages (
        message_sid text PRIMARY KEY,
        status text NOT NULL
      );
      INSERT INTO sms_messages (message_sid, status) VALUES ('${sid}', 'deferred');
    `);

    const claim = () =>
      db.query<{ message_sid: string; status: string }>(
        `UPDATE sms_messages
         SET status = 'sending'
         WHERE message_sid = $1 AND status = 'deferred'
         RETURNING *`,
        [sid]
      );

    const [a, b] = await Promise.all([claim(), claim()]);
    const winners = [a, b].filter((r) => r.rows.length === 1);
    expect(winners).toHaveLength(1);
    expect(winners[0].rows[0].status).toBe('sending');

    const final = await db.query<{ status: string }>(
      `SELECT status FROM sms_messages WHERE message_sid = $1`,
      [sid]
    );
    expect(final.rows[0].status).toBe('sending');
  });
});
