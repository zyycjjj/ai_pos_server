import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ListPrintJobsDto {
  @IsOptional()
  @IsIn(['PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED'])
  status?: 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

  @IsOptional()
  @IsString()
  printerId?: string;

  @IsOptional()
  @IsIn(['CUSTOMER_RECEIPT', 'KITCHEN_TICKET', 'REFUND_RECEIPT', 'SHIFT_SUMMARY', 'TEST_PAGE'])
  documentType?: 'CUSTOMER_RECEIPT' | 'KITCHEN_TICKET' | 'REFUND_RECEIPT' | 'SHIFT_SUMMARY' | 'TEST_PAGE';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(200)
  take?: number;
}

export class UpsertPrinterDto {
  @IsString()
  @MaxLength(80)
  name!: string;

  @IsString()
  @MaxLength(24)
  code!: string;

  @IsIn(['RECEIPT', 'KITCHEN', 'MULTI_PURPOSE'])
  type!: 'RECEIPT' | 'KITCHEN' | 'MULTI_PURPOSE';

  @IsIn(['LAN', 'USB'])
  connectionType!: 'LAN' | 'USB';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  host?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  usbVendorId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  usbProductId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(58)
  @Max(80)
  paperWidth?: number;

  @IsOptional()
  @IsBoolean()
  autoCut?: boolean;

  @IsOptional()
  @IsBoolean()
  cashDrawerPulse?: boolean;
}

export class UpdatePrinterStatusDto {
  @IsIn(['ACTIVE', 'INACTIVE'])
  status!: 'ACTIVE' | 'INACTIVE';
}

export class UpsertPrinterRouteDto {
  @IsString()
  printerId!: string;

  @IsIn(['STORE_DEFAULT', 'KITCHEN_STATION'])
  routeType!: 'STORE_DEFAULT' | 'KITCHEN_STATION';

  @IsOptional()
  @IsString()
  targetId?: string;

  @IsIn(['CUSTOMER_RECEIPT', 'KITCHEN_TICKET', 'REFUND_RECEIPT', 'SHIFT_SUMMARY', 'TEST_PAGE'])
  documentType!: 'CUSTOMER_RECEIPT' | 'KITCHEN_TICKET' | 'REFUND_RECEIPT' | 'SHIFT_SUMMARY' | 'TEST_PAGE';
}

export class PrintFailDto {
  @IsString()
  @MaxLength(1000)
  error!: string;
}

export class ReprintDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
