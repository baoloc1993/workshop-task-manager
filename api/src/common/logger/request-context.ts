import { AsyncLocalStorage } from 'node:async_hooks';

interface RequestContext {
  requestId: string;
}

// Nguồn duy nhất cho request id — middleware gán, logger + exception filter đọc lại,
// để một dòng log JSON lần ra đúng một request mà không phải truyền tham số qua mọi tầng.
export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function getRequestId(): string | undefined {
  return requestContextStorage.getStore()?.requestId;
}
