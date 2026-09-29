import { IsInt, Max, Min } from 'class-validator';

/** Extra 25-student blocks, bought inside a live paid period. */
export class AddBlocksOrderDto {
  @IsInt()
  @Min(1)
  @Max(40)
  blocks!: number;
}
