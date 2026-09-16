import type { LoggerService, LogLevel } from '@nestjs/common';
import { getRequestId } from './request-context.js';

// Nhóm 1 production-ready: log JSON có timestamp + mức độ + request id — đủ để lần
// lại một lỗi trên production mà không cần đoán. Cài trực tiếp LoggerService thay vì
// kế thừa nội bộ ConsoleLogger (API không công khai, dễ vỡ khi Nest đổi version).
// Không log dữ liệu nhạy cảm (mật khẩu, token) — nơi gọi logger chịu trách nhiệm đó
// (CONVENTIONS.md §5, xem auth/notifications: message không bao giờ mang giá trị đó).
export class JsonLogger implements LoggerService {
  private write(level: LogLevel, context: string | undefined, message: unknown, extra?: unknown[]) {
    const isError = message instanceof Error;
    const line = {
      ts: new Date().toISOString(),
      level,
      context,
      requestId: getRequestId(),
      msg: isError ? message.message : message,
      ...(isError && message.stack ? { stack: message.stack } : {}),
      ...(extra && extra.length > 0 ? { extra } : {}),
    };
    process.stdout.write(`${JSON.stringify(line)}\n`);
  }

  log(message: unknown, ...optionalParams: unknown[]) {
    const context = typeof optionalParams.at(-1) === 'string' ? (optionalParams.pop() as string) : undefined;
    this.write('log', context, message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]) {
    const context = typeof optionalParams.at(-1) === 'string' ? (optionalParams.pop() as string) : undefined;
    this.write('error', context, message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]) {
    const context = typeof optionalParams.at(-1) === 'string' ? (optionalParams.pop() as string) : undefined;
    this.write('warn', context, message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]) {
    const context = typeof optionalParams.at(-1) === 'string' ? (optionalParams.pop() as string) : undefined;
    this.write('debug', context, message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]) {
    const context = typeof optionalParams.at(-1) === 'string' ? (optionalParams.pop() as string) : undefined;
    this.write('verbose', context, message, optionalParams);
  }
}
