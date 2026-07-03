import { IsEnum } from 'class-validator';
import { StoreRole } from '@prisma/client';

export class UpdateStaffRoleDto {
  @IsEnum(StoreRole)
  role!: StoreRole;
}
