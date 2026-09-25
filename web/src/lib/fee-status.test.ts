import { describe, expect, it } from 'vitest';
import { batchFeeLabel, owedCount, summarizeBatchFees } from './fee-status';

describe('batch card fee summary (H5.6)', () => {
  it('a single waived fee reads "Waived", never "1/1 paid"', () => {
    const summary = summarizeBatchFees([{ status: 'waived' }]);
    expect(summary).toEqual({ paid: 0, waived: 1, total: 1 });
    expect(batchFeeLabel(summary)).toBe('Waived this period');
  });

  it('waived fees are shown separately and excluded from the paid ratio', () => {
    const summary = summarizeBatchFees([{ status: 'paid' }, { status: 'waived' }, { status: 'due' }]);
    expect(summary).toEqual({ paid: 1, waived: 1, total: 3 });
    expect(batchFeeLabel(summary)).toBe('1/2 paid · 1 waived this period');
  });

  it('partial and due are neither paid nor waived', () => {
    const summary = summarizeBatchFees([{ status: 'partial' }, { status: 'due' }, { status: 'paid' }]);
    expect(batchFeeLabel(summary)).toBe('1/3 paid this period');
  });
});

describe('owedCount (H5)', () => {
  it('excludes waived entries from what is owed', () => {
    expect(owedCount({ entries: 3, waivedCount: 1 })).toBe(2);
    expect(owedCount({ entries: 1, waivedCount: 1 })).toBe(0);
  });
});
