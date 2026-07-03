import { IsString, MinLength } from 'class-validator';

export class SwitchStoreDto {
  @IsString()
  @MinLength(1)
  storeId!: string;
}
