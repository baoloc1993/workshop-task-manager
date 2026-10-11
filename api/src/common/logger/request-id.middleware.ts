import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { requestContextStorage } from './request-context.js';

// mọi dòng log của một request phải lần lại được bằng
// đúng một request id — nhận lại từ upstream (nếu có) hoặc tự sinh.
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
    res.setHeader('x-request-id', requestId);
    requestContextStorage.run({ requestId }, () => next());
  }
}
