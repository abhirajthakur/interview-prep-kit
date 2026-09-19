import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
  correlationId: string;
}

export const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();
