import { IsBoolean } from 'class-validator';

export class DisableStaffDto {
  @IsBoolean()
  disabled!: boolean;
}
