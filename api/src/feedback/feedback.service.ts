import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateFeedbackDto } from './dto/create-feedback.dto.js';

// Nhóm 4 production-ready — "kênh feedback" (review pha P vòng 6). Chưa có màn đọc lại
// ở vòng 6 (ROADMAP.md §3 backlog nếu pilot vòng 7 cần) — owner tra trực tiếp qua DB
// trong lúc pilot, đủ cho quy mô xưởng nhỏ.
@Injectable()
export class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, dto: CreateFeedbackDto) {
    return this.prisma.feedback.create({ data: { userId, message: dto.message } });
  }
}
