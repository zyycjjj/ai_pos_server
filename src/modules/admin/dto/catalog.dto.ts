import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ListAdminProductsDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';

  @IsOptional()
  @IsIn(['AVAILABLE', 'SOLD_OUT'])
  availabilityStatus?: 'AVAILABLE' | 'SOLD_OUT';
}

export class UpsertProductDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';

  @IsOptional()
  @IsIn(['AVAILABLE', 'SOLD_OUT'])
  availabilityStatus?: 'AVAILABLE' | 'SOLD_OUT';
}

export class UpdateProductStatusDto {
  @IsIn(['ACTIVE', 'INACTIVE'])
  status!: 'ACTIVE' | 'INACTIVE';
}

export class UpdateProductAvailabilityDto {
  @IsIn(['AVAILABLE', 'SOLD_OUT'])
  availabilityStatus!: 'AVAILABLE' | 'SOLD_OUT';
}

export class UpsertCategoryDto {
  @IsString()
  name!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sortOrder?: number;
}

export class UpdateCatalogStatusDto {
  @IsIn(['ACTIVE', 'INACTIVE'])
  status!: 'ACTIVE' | 'INACTIVE';
}

export class UpsertModifierGroupDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsIn(['SINGLE', 'MULTI'])
  selectionType?: 'SINGLE' | 'MULTI';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minSelect?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxSelect?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sortOrder?: number;
}

export class UpsertModifierOptionDto {
  @IsString()
  name!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  priceDelta!: number;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE', 'SOLD_OUT'])
  status?: 'ACTIVE' | 'INACTIVE' | 'SOLD_OUT';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sortOrder?: number;
}

export class UpdateModifierOptionStatusDto {
  @IsIn(['ACTIVE', 'INACTIVE', 'SOLD_OUT'])
  status!: 'ACTIVE' | 'INACTIVE' | 'SOLD_OUT';
}
