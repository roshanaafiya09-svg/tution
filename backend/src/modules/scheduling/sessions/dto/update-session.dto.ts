import { IsOptional, IsUrl } from 'class-validator';

/**
 * H4 "edit": the only session field safe to change without it being a
 * reschedule (time) or an ownership change. There is deliberately no
 * academyId/tutorId/batchId here — see UpdateBatchDto for the same
 * pattern at the batch level.
 */
export class UpdateSessionDto {
  /** Omit to leave unchanged, `null` to clear it, or a valid URL to set
   *  it — @IsOptional() treats both undefined AND null as "skip IsUrl",
   *  so a client can send either without it being rejected. */
  @IsOptional()
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { message: 'meetingUrl must be a full http(s) URL' },
  )
  meetingUrl?: string | null;
}
