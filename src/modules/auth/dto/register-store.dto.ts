import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterStoreDto {
  @IsString()
  @MinLength(1)
  storeName!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
