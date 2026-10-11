import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CustomersService } from './customers.service.js';

// chỉ owner ghi đơn/tra khách (ma trận chưa
// mở quyền này cho thợ; người đo chỉ chạm số đo qua Task của chính mình, không tra khách).
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Roles('owner')
  @Get('search')
  search(@Query('q') q?: string) {
    return this.customers.search(q ?? '');
  }
}
