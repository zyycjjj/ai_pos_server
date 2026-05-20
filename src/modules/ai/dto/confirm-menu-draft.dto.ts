import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class ConfirmMenuDraftDto {
  @ApiPropertyOptional({
    default: false,
    description: 'When true, inactive duplicate product names are restored instead of creating new rows.',
  })
  @IsOptional()
  @IsBoolean()
  restoreInactiveDuplicates?: boolean;
}
