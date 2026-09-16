import { IsIn } from 'class-validator';
import type { AcademyContactRequestStatus } from '../../../../database/types';

const STATUSES: AcademyContactRequestStatus[] = [
  'new',
  'contacted',
  'interested',
  'joined',
  'not_interested',
];

export class UpdateContactRequestStatusDto {
  @IsIn(STATUSES)
  status!: AcademyContactRequestStatus;
}
