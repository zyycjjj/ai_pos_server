import { IsBooleanString, IsIn, IsOptional } from 'class-validator';

export class ListProductsDto {
  @IsOptional()
  @IsBooleanString()
  active?: string;

  @IsOptional()
  @IsIn(['name', 'category', 'createdAt'])
  orderBy?: 'name' | 'category' | 'createdAt';
}

