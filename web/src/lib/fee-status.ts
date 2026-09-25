/** One batch's fee collection for the current period, as shown on its card.
 *  A waived fee is neither paid nor outstanding — it used to be counted as
 *  "paid" here, so a batch whose only fee was waived read "1/1 paid". */
export interface BatchFeeSummary {
  paid: number;
  waived: number;
  total: number;
}

export function summarizeBatchFees(entries: ReadonlyArray<{ status: string }>): BatchFeeSummary {
  const summary: BatchFeeSummary = { paid: 0, waived: 0, total: entries.length };
  for (const entry of entries) {
    if (entry.status === 'paid') summary.paid += 1;
    else if (entry.status === 'waived') summary.waived += 1;
  }
  return summary;
}

/** e.g. "1/2 paid · 1 waived this period"; "Waived this period" when every
 *  fee was waived. Paid is counted out of the fees actually owed (total
 *  minus waived), so a waiver never looks like missing money either. */
export function batchFeeLabel(summary: BatchFeeSummary): string {
  const owed = summary.total - summary.waived;
  if (owed === 0) return 'Waived this period';
  const paid = `${summary.paid}/${owed} paid`;
  return summary.waived > 0 ? `${paid} · ${summary.waived} waived this period` : `${paid} this period`;
}

/** How many of a period's fee entries are actually owed — every entry
 *  except waived ones. "N of M paid" counts use this as M, so a waiver
 *  never reads as an unpaid student. */
export function owedCount(totals: { entries: number; waivedCount?: number }): number {
  return totals.entries - (totals.waivedCount ?? 0);
}
