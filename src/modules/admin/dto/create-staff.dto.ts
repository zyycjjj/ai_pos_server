import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { StoreRole } from '@prisma/client';

export class CreateStaffDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsEnum(StoreRole)
  role!: StoreRole;
}
