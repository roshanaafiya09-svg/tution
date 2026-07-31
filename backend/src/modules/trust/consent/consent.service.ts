import { Injectable } from '@nestjs/common';
import { ConsentRepository } from './consent.repository';
import type { RecordConsentDto } from './dto/record-consent.dto';

const MAX_USER_AGENT_LENGTH = 500;

@Injectable()
export class ConsentService {
  constructor(private readonly repository: ConsentRepository) {}

  record(
    userId: string,
    dto: RecordConsentDto,
    ip: string | null,
    userAgent: string | null,
  ) {
    return this.repository.create({
      userId,
      consentType: dto.consentType,
      policyVersion: dto.policyVersion,
      ip,
      userAgent: userAgent ? userAgent.slice(0, MAX_USER_AGENT_LENGTH) : null,
    });
  }

  listOwn(userId: string) {
    return this.repository.listForUser(userId);
  }
}
