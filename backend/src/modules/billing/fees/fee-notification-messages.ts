export type FeeNotificationAudience = 'student' | 'parent';

export type FeeNotificationEvent = 'raised' | 'paid' | 'partial' | 'waived';

/**
 * Title wording for a tuition-fee notice. The student's own copy keeps the
 * original wording — they know who they are. A parent may have several
 * children in the same batch or different ones, so their copy names the
 * child in the title itself ("Fee due for Aisha Raman — Mathematics"),
 * readable straight from the notification list.
 */
export function feeNotificationTitle(
  event: FeeNotificationEvent,
  audience: FeeNotificationAudience,
  batchTitle: string,
  studentName: string | null,
): string {
  const label = {
    raised: 'Fee due',
    paid: 'Fee paid',
    partial: 'Payment received',
    waived: 'Fee waived',
  }[event];
  if (audience === 'student') return `${label} — ${batchTitle}`;
  return `${label} for ${studentName ?? 'your child'} — ${batchTitle}`;
}
