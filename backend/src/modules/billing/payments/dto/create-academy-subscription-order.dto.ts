import { IsInt, Max, Min } from 'class-validator';

/** An academy's monthly period. The academy comes from the authenticated
 *  owner and the per-teacher fee is counted server-side — neither is here. */
export class CreateAcademySubscriptionOrderDto {
  @IsInt()
  @Min(1)
  @Max(100)
  blocks!: number;
}
