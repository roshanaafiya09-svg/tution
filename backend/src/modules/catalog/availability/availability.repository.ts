import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB } from '../../../database/types';
import { newId } from '../../../database/id';
import type { CreateAvailabilityDto } from './dto/create-availability.dto';
import type { CreateAvailabilityExceptionDto } from './dto/create-availability-exception.dto';

@Injectable()
export class AvailabilityRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  listForTutor(tutorId: string) {
    return this.db
      .selectFrom('tutor_availability')
      .selectAll()
      .where('tutor_id', '=', tutorId)
      .orderBy('weekday')
      .execute();
  }

  findById(id: string) {
    return this.db
      .selectFrom('tutor_availability')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  create(tutorId: string, dto: CreateAvailabilityDto) {
    return this.db
      .insertInto('tutor_availability')
      .values({
        id: newId(),
        tutor_id: tutorId,
        weekday: dto.weekday,
        start_time: dto.startTime,
        end_time: dto.endTime,
        timezone: dto.timezone ?? 'Asia/Kolkata',
        effective_from: dto.effectiveFrom,
        effective_to: dto.effectiveTo ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  delete(id: string) {
    return this.db
      .deleteFrom('tutor_availability')
      .where('id', '=', id)
      .execute();
  }

  listExceptionsForTutor(tutorId: string) {
    return this.db
      .selectFrom('tutor_availability_exceptions')
      .selectAll()
      .where('tutor_id', '=', tutorId)
      .orderBy('date')
      .execute();
  }

  findExceptionById(id: string) {
    return this.db
      .selectFrom('tutor_availability_exceptions')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  createException(tutorId: string, dto: CreateAvailabilityExceptionDto) {
    return this.db
      .insertInto('tutor_availability_exceptions')
      .values({
        id: newId(),
        tutor_id: tutorId,
        date: dto.date,
        is_available: dto.isAvailable,
        start_time: dto.startTime ?? null,
        end_time: dto.endTime ?? null,
      })
      .onConflict((oc) =>
        oc.columns(['tutor_id', 'date']).doUpdateSet({
          is_available: dto.isAvailable,
          start_time: dto.startTime ?? null,
          end_time: dto.endTime ?? null,
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  deleteException(id: string) {
    return this.db
      .deleteFrom('tutor_availability_exceptions')
      .where('id', '=', id)
      .execute();
  }
}
