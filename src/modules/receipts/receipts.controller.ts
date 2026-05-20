import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ReceiptsService } from './receipts.service';

@ApiTags('receipts')
@Controller('receipts')
export class ReceiptsController {
  constructor(private readonly receiptsService: ReceiptsService) {}

  @Get('orders/:orderId')
  @ApiOperation({ summary: 'Build an 80mm ESC/POS-friendly receipt payload for an order.' })
  getReceiptForOrder(@Param('orderId') orderId: string) {
    return this.receiptsService.getReceiptForOrder(orderId);
  }
}
