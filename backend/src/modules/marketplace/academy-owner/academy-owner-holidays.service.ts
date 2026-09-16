import { Injectable, NotFoundException } from '@nestjs/common';
import { DateTime } from 'luxon';
import { AcademiesRepository } from '../academies/academies.repository';
import { HolidayService } from '../../holidays/holiday.service';
import type { CreateAcademyHolidayDto } from '../../holidays/dto/create-academy-holiday.dto';

const DEFAULT_LOOKAHEAD_DAYS = 365; // a full year of the calendar, government holidays included

/** Academy Holiday management (spec §6) — same resolveOwnAcademy
 *  delegation shape as AcademyOwnerLeaveService/AcademyOwnerBatchesService. */
@Injectable()
export class AcademyOwnerHolidaysService {
  constructor(
    private readonly academiesRepository: AcademiesRepository,
    private readonly holidayService: HolidayService,
  ) {}

  private async resolveOwnAcademy(ownerUserId: string) {
    const academy =
      await this.academiesRepository.findByOwnerUserId(ownerUserId);
    if (!academy) {
      throw new NotFoundException('No academy is linked to this account yet');
    }
    return academy;
  }

  async list(ownerUserId: string, from?: string, to?: string) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    const rangeFrom = from ?? DateTime.now().toISODate();
    const rangeTo =
      to ??
      DateTime.fromISO(rangeFrom)
        .plus({ days: DEFAULT_LOOKAHEAD_DAYS })
        .toISODate()!;
    return this.holidayService.listEffectiveForAcademy(
      academy.id,
      rangeFrom,
      rangeTo,
    );
  }

  async create(ownerUserId: string, dto: CreateAcademyHolidayDto) {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    return this.holidayService.createAcademyHoliday(
      academy.id,
      dto,
      ownerUserId,
    );
  }

  async remove(ownerUserId: string, holidayId: string): Promise<void> {
    const academy = await this.resolveOwnAcademy(ownerUserId);
    await this.holidayService.deleteAcademyHoliday(academy.id, holidayId);
  }
}
