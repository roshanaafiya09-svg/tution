import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../database/database.module';
import type { DB, HolidayScope } from '../../database/types';
import { newId } from '../../database/id';

export interface NewAcademyHoliday {
  academyId: string;
  name: string;
  startDate: string;
  endDate: string;
  scope: HolidayScope;
  description: string | null;
  createdBy: string;
}

/**
 * Owns `holidays`/`holiday_batches` (migration 0035). `state_code = null`
 * rows are national holidays and match every academy regardless of its
 * own state — see the migration's doc comment for why.
 */
@Injectable()
export class HolidaysRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  findById(id: string) {
    return this.db
      .selectFrom('holidays')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  /** Government holidays applicable to a country/state within [from, to]
   *  (inclusive) — national holidays (state_code null) always match. */
  listGovernment(
    countryCode: string,
    stateCode: string,
    from: string,
    to: string,
  ) {
    return this.db
      .selectFrom('holidays')
      .selectAll()
      .where('type', '=', 'government_holiday')
      .where('country_code', '=', countryCode)
      .where((eb) =>
        eb.or([eb('state_code', '=', stateCode), eb('state_code', 'is', null)]),
      )
      .where('start_date', '<=', to)
      .where('end_date', '>=', from)
      .orderBy('start_date')
      .execute();
  }

  /** Government holidays covering one specific calendar date — the daily
   *  cron's "is today a holiday for this academy" lookup. */
  listGovernmentActiveOn(countryCode: string, stateCode: string, date: string) {
    return this.listGovernment(countryCode, stateCode, date, date);
  }

  listForAcademy(academyId: string, from: string, to: string) {
    return this.db
      .selectFrom('holidays')
      .selectAll()
      .where('type', '=', 'academy_holiday')
      .where('academy_id', '=', academyId)
      .where('start_date', '<=', to)
      .where('end_date', '>=', from)
      .orderBy('start_date')
      .execute();
  }

  /**
   * Every holiday in [from, to] (inclusive dates) that applies to one
   * academy batch — the same applicability rules HolidayService.
   * applyHolidayForAcademy uses to cancel classes:
   *  - an academy-wide holiday of THIS academy;
   *  - a batch-scoped holiday of this academy that lists this batch;
   *  - a government holiday for the academy's own country/state (national
   *    ones always match), but only if the academy observes them.
   * Keyed on the batch's owning academy, never on a teacher, so another
   * academy's holidays can never match.
   */
  listEffectiveForAcademyBatch(
    academyId: string,
    batchId: string,
    from: string,
    to: string,
  ) {
    return this.db
      .selectFrom('holidays')
      .selectAll('holidays')
      .where('holidays.start_date', '<=', to)
      .where('holidays.end_date', '>=', from)
      .where((eb) =>
        eb.or([
          eb.and([
            eb('holidays.type', '=', 'academy_holiday'),
            eb('holidays.academy_id', '=', academyId),
            eb.or([
              eb('holidays.scope', '=', 'academy'),
              eb.exists(
                eb
                  .selectFrom('holiday_batches')
                  .select('holiday_batches.batch_id')
                  .whereRef('holiday_batches.holiday_id', '=', 'holidays.id')
                  .where('holiday_batches.batch_id', '=', batchId),
              ),
            ]),
          ]),
          eb.and([
            eb('holidays.type', '=', 'government_holiday'),
            eb.exists(
              eb
                .selectFrom('academies')
                .select('academies.id')
                .where('academies.id', '=', academyId)
                .where('academies.auto_observe_govt_holidays', '=', true)
                .whereRef(
                  'academies.country_code',
                  '=',
                  'holidays.country_code',
                )
                .where((inner) =>
                  inner.or([
                    inner('holidays.state_code', 'is', null),
                    inner(
                      'holidays.state_code',
                      '=',
                      inner.ref('academies.state_code'),
                    ),
                  ]),
                ),
            ),
          ]),
        ]),
      )
      .orderBy('holidays.start_date')
      .execute();
  }

  /** Owned-lookup for delete/read — an academy can only ever touch its
   *  own academy-declared holidays, never a government one. */
  findAcademyHoliday(id: string, academyId: string) {
    return this.db
      .selectFrom('holidays')
      .selectAll()
      .where('id', '=', id)
      .where('academy_id', '=', academyId)
      .where('type', '=', 'academy_holiday')
      .executeTakeFirst();
  }

  createAcademyHoliday(input: NewAcademyHoliday) {
    return this.db
      .insertInto('holidays')
      .values({
        id: newId(),
        type: 'academy_holiday',
        name: input.name,
        start_date: input.startDate,
        end_date: input.endDate,
        country_code: 'IN',
        state_code: null,
        academy_id: input.academyId,
        scope: input.scope,
        description: input.description,
        created_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  delete(id: string) {
    return this.db.deleteFrom('holidays').where('id', '=', id).execute();
  }

  setBatchScope(holidayId: string, batchIds: string[]) {
    if (batchIds.length === 0) return Promise.resolve(undefined);
    return this.db
      .insertInto('holiday_batches')
      .values(
        batchIds.map((batchId) => ({
          holiday_id: holidayId,
          batch_id: batchId,
        })),
      )
      .execute()
      .then(() => undefined);
  }

  async listBatchIdsForHoliday(holidayId: string): Promise<string[]> {
    const rows = await this.db
      .selectFrom('holiday_batches')
      .select('batch_id')
      .where('holiday_id', '=', holidayId)
      .execute();
    return rows.map((r) => r.batch_id);
  }
}
