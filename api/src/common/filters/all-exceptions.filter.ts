import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import * as Sentry from '@sentry/node';

// Nhóm 1 (error tracking) + Nhóm 2 (SECURITY.md §4 "không trả stack trace hay thông
// tin nội bộ ra response lỗi"). Lỗi đã biết (HttpException — 4xx nghiệp vụ) giữ nguyên
// message tiếng Việt đã viết ở service. Lỗi KHÔNG lường trước (500) thì: log đủ để lần
// lại, báo Sentry, và trả một câu chung — không bao giờ lộ message/stack thật của lỗi
// hệ thống ra ngoài.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    if (!isHttpException || status >= 500) {
      this.logger.error(exception instanceof Error ? exception : new Error(String(exception)));
      Sentry.captureException(exception);
    }

    const body = isHttpException
      ? exception.getResponse()
      : { statusCode: status, message: 'Có lỗi ở hệ thống — thử lại sau ít phút' };

    res.status(status).json(typeof body === 'string' ? { statusCode: status, message: body } : body);
  }
}
