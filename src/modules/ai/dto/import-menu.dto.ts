import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';

export class ImportMenuDto {
  @ApiProperty({
    description: 'Reviewed AI menu JSON returned by /api/ai/menu/generate.',
  })
  @IsObject()
  menu!: Record<string, unknown>;
}
