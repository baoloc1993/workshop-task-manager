import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CreateRouteDto } from './dto/create-route.dto.js';
import { UpdateRouteDto } from './dto/update-route.dto.js';
import { RoutesService } from './routes.service.js';

// GET không @Roles('owner') riêng — S18 (mọi vai ghi đơn = chỉ owner thật ra, nhưng danh
// sách khu vực còn cần cho S23 hàng trả) đều là owner ở vòng 7 (không thợ nào chạm khu
// vực), nên khoá cả @Controller là đủ, không cần phân theo method như UsersController.
@Roles('owner')
@Controller('routes')
export class RoutesController {
  constructor(private readonly routes: RoutesService) {}

  @Get()
  findAll() {
    return this.routes.findAll();
  }

  @Post()
  create(@Body() dto: CreateRouteDto) {
    return this.routes.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRouteDto) {
    return this.routes.update(id, dto);
  }
}
