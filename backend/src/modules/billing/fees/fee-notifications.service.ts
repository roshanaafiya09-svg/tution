import { Injectable, Logger } from '@nestjs/common';
import type { Selectable } from 'kysely';
import type { FeeLedgerTable } from '../../../database/types';
import { NotificationsService } from '../../notifications/notifications.service';
import { ParentLinksRepository } from '../../parents/parent-links.repository';
import { BatchesRepository } from '../../scheduling/batches/batches.repository';

type FeeRow = Selectable<FeeLedgerTable>;

export const FEE_RAISED = 'fee_raised';
export const FEE_PAYMENT_RECORDED = 'fee_payment_recorded';
export const FEE_WAIVED = 'fee_waived';

/**
 * Tuition-fee notifications — the student's fee ledger only. This is NOT
 * Scholar's own subscription billing (tutor plans / parent premium), which
 * never flows through here.
 *
 * Recipients are the student and their ACTIVELY-consented parents. Every
 * call is best-effort: the money action has already committed, so a
 * delivery failure is logged and never fails or rolls it back. Each event
 * carries a dedupe key so a repeat (regenerating a period, a re-delivered
 * payment webhook) never notifies twice.
 */
@Injectable()
export class FeeNotificationsService {
  private readonly logger = new Logger(FeeNotificationsService.name);

  constructor(
    private readonly notifications: NotificationsService,
    private readonly parentLinks: ParentLinksRepository,
    private readonly batches: BatchesRepository,
  ) {}

  /** A fee row was raised (or re-generated) for a period. Only untouched
   *  'due' rows are announced — a row already paid/partial/waived is
   *  financial history, not a new charge. */
  async notifyRaised(entries: FeeRow[]): Promise<void> {
    for (const entry of entries) {
      if (entry.status !== 'due') continue;
      await this.safely(`fee raised ${entry.id}`, async () => {
        const batchTitle = await this.batchTitle(entry.batch_id);
        await this.toFamily(entry, {
          type: FEE_RAISED,
          title: `Fee due — ${batchTitle}`,
          body: `${formatMinor(entry.expected_minor, entry.currency)} is due for ${entry.period_label}.`,
          dedupeKey: `fee-raised:${entry.id}`,
        });
      });
    }
  }

  /** A payment landed on a fee row — recorded by the teacher, or captured
   *  online. `payerId` is excluded from the recipients (they just did it);
   *  for an online payment the teacher who is owed is told too. */
  async notifyPaymentRecorded(
    entry: FeeRow,
    opts: { source: 'teacher' | 'online'; payerId?: string },
  ): Promise<void> {
    await this.safely(`fee payment ${entry.id}`, async () => {
      const batchTitle = await this.batchTitle(entry.batch_id);
      const paid = entry.recorded_paid_minor ?? 0;
      const settled = entry.status === 'paid';
      await this.toFamily(
        entry,
        {
          type: FEE_PAYMENT_RECORDED,
          title: settled
            ? `Fee paid — ${batchTitle}`
            : `Payment received — ${batchTitle}`,
          body: settled
            ? `${entry.period_label} is fully paid (${formatMinor(paid, entry.currency)}).`
            : `${formatMinor(paid, entry.currency)} of ${formatMinor(entry.expected_minor, entry.currency)} received for ${entry.period_label}.`,
          dedupeKey: `fee-payment:${entry.id}:${paid}`,
        },
        opts.payerId,
      );
      if (opts.source === 'online' && entry.tutor_id !== opts.payerId) {
        await this.notifications.notify({
          userIds: [entry.tutor_id],
          type: FEE_PAYMENT_RECORDED,
          title: `Payment received — ${batchTitle}`,
          body: `${formatMinor(paid, entry.currency)} paid online for ${entry.period_label}.`,
          payload: { feeLedgerId: entry.id, batchId: entry.batch_id },
          dedupeKey: `fee-payment:${entry.id}:${paid}`,
        });
      }
    });
  }

  async notifyWaived(entry: FeeRow): Promise<void> {
    await this.safely(`fee waived ${entry.id}`, async () => {
      const batchTitle = await this.batchTitle(entry.batch_id);
      await this.toFamily(entry, {
        type: FEE_WAIVED,
        title: `Fee waived — ${batchTitle}`,
        body: `The fee for ${entry.period_label} has been waived.`,
        dedupeKey: `fee-waived:${entry.id}`,
      });
    });
  }

  private async toFamily(
    entry: FeeRow,
    msg: {
      type: string;
      title: string;
      body: string;
      dedupeKey: string;
    },
    excludeUserId?: string,
  ): Promise<void> {
    const parentIds = await this.parentLinks.listActiveParentIdsForStudents([
      entry.student_id,
    ]);
    const userIds = [entry.student_id, ...parentIds].filter(
      (id) => id !== excludeUserId,
    );
    await this.notifications.notify({
      userIds,
      type: msg.type,
      title: msg.title,
      body: msg.body,
      payload: {
        feeLedgerId: entry.id,
        batchId: entry.batch_id,
        studentId: entry.student_id,
      },
      dedupeKey: msg.dedupeKey,
    });
  }

  private async batchTitle(batchId: string): Promise<string> {
    return (await this.batches.findById(batchId))?.title ?? 'your batch';
  }

  private async safely(what: string, run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (err) {
      this.logger.warn(
        `Could not send ${what} notification: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

/** ₹1,500 / ₹1,500.50 from minor units (paise). */
function formatMinor(minor: number, currency: string): string {
  const major = minor / 100;
  const symbol = currency === 'INR' ? '₹' : `${currency} `;
  return `${symbol}${major.toLocaleString('en-IN', {
    minimumFractionDigits: Number.isInteger(major) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}
