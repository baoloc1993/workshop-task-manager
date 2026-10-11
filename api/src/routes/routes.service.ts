import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateRouteDto } from './dto/create-route.dto.js';
import { UpdateRouteDto } from './dto/update-route.dto.js';

@Injectable()
export class RoutesService {
  constructor(private readonly prisma: PrismaService) {}

  // cả khu vực đang bật lẫn tắt đều hiện (owner tự bật lại được), khác S9/S22
  // (chỉ hiện việc CHƯA xong) vì đây là màn cấu hình, không phải hàng đợi việc.
  findAll() {
    return this.prisma.route.findMany({ orderBy: { name: 'asc' } });
  }

  create(dto: CreateRouteDto) {
    return this.prisma.route.create({ data: { name: dto.name } });
  }

  async update(id: string, dto: UpdateRouteDto) {
    const route = await this.prisma.route.findUnique({ where: { id } });
    if (!route) throw new NotFoundException('Không tìm thấy khu vực này');
    return this.prisma.route.update({ where: { id }, data: dto });
  }
}
