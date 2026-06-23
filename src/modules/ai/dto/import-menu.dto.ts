import { ApiProperty } from '@nestjs/swagger';

export class ImportMenuDto {
  @ApiProperty({
    description: 'Reviewed AI menu JSON returned by /api/ai/menu/generate.',
  })
  menu: unknown;
}
