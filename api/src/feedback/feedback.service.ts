import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateFeedbackDto } from './dto/create-feedback.dto.js';

// "kênh feedback". Chưa có màn đọc lại
// (backlog nếu pilot cần) — owner tra trực tiếp qua DB
// trong lúc pilot, đủ cho quy mô xưởng nhỏ.
@Injectable()
export class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, dto: CreateFeedbackDto) {
    return this.prisma.feedback.create({ data: { userId, message: dto.message } });
  }
}
