import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

// S18 (autocomplete theo SĐT khi ghi đơn) + S21 "Tra khách cũ" —
// cùng một nguồn dữ liệu, chỉ khác độ sâu hiển thị ở client.
const ORDER_SUMMARY_SELECT = {
  id: true,
  description: true,
  mode: true,
  dueAt: true,
  status: true,
  measurementLength: true,
  measurementDepth: true,
  measurementWidth: true,
  measurementThickness: true,
  measurementPhoto: true,
  pillows: true,
  createdAt: true,
} as const;

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  // Tìm theo SĐT hoặc tên, chuỗi con không phân biệt hoa/thường — quy mô ~1.000
  // khách/năm không cần full-text search riêng.
  async search(q: string) {
    const term = q.trim();
    if (!term) return [];
    const customers = await this.prisma.customer.findMany({
      where: { OR: [{ phone: { contains: term } }, { name: { contains: term, mode: 'insensitive' } }] },
      include: {
        area: { select: { id: true, name: true } },
        orders: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, select: ORDER_SUMMARY_SELECT },
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });
    return customers;
  }
}
