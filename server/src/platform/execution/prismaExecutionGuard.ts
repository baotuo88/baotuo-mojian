import type { Prisma, PrismaClient } from "@prisma/client";
import { assertExecutionWriteAllowed, isExecutionMutation } from "./persistenceFence";
import { getExecutionScope, runWithExecutionScope, throwIfExecutionAborted } from "./executionScope";

type DeferredOperation = { delegate?: string; operation: string; args: unknown[] };
type DynamicClient = Record<string, any>;

/**
 * Keep Prisma promises lazy, including array transactions. A protected write and
 * its persisted ownership check share a short transaction, never an LLM lifetime.
 */
export function guardPrismaExecutionWrites(client: PrismaClient): PrismaClient {
  const deferred = new WeakMap<object, DeferredOperation>();
  const extended = client.$extends({
    name: "execution-write-fence",
    query: {
      async $allOperations({ model, operation, args, query }) {
        if (!isExecutionMutation(operation)) return query(args);
        throwIfExecutionAborted();
        const scope = getExecutionScope();
        if (!scope || scope.writeFenceHeld) return query(args);
        // Standalone mutations must be atomic with lease/cancellation validation.
        return client.$transaction(async (tx) => {
          await assertExecutionWriteAllowed(tx, true);
          return runWithExecutionScope({ writeFenceHeld: true }, async () => {
            const delegate = model ? model.charAt(0).toLowerCase() + model.slice(1) : undefined;
            const target = delegate ? (tx as unknown as DynamicClient)[delegate] : tx as unknown as DynamicClient;
            const rawOperation = model || operation.startsWith("$") ? operation : `$${operation}`;
            const result = !model && rawOperation.endsWith("Unsafe") && Array.isArray(args)
              ? await target[rawOperation](...args)
              : await target[rawOperation](args);
            await assertExecutionWriteAllowed(tx, true);
            return result;
          });
        });
      },
    },
  });
  const nativeTransaction = extended.$transaction;
  const delegateCache = new Map<string, { source: object; delegate: object }>();
  const remember = (result: unknown, operation: DeferredOperation) => {
    if (result && (typeof result === "object" || typeof result === "function")) {
      deferred.set(result, operation);
    }
    return result;
  };
  return new Proxy(extended, {
    get(target, property, receiver) {
      if (property === "$transaction") {
        // Preserve injected transaction adapters used by focused service tests.
        if (target.$transaction !== nativeTransaction) return target.$transaction;
        return (input: unknown, options?: unknown) => {
          const transaction = nativeTransaction.bind(target) as (...args: any[]) => Promise<unknown>;
          const scope = getExecutionScope();
          if (!scope) return transaction(input, options);
          throwIfExecutionAborted();
          const runner = typeof input === "function"
            ? input as (tx: Prisma.TransactionClient) => Promise<unknown>
            : Array.isArray(input)
              ? async (tx: Prisma.TransactionClient) => {
                const results = [];
                for (const promise of input) {
                  const operation = deferred.get(promise);
                  if (!operation) throw new Error("执行围栏事务不能混用其他 Prisma 客户端的操作。");
                  const txTarget = operation.delegate
                    ? (tx as unknown as DynamicClient)[operation.delegate]
                    : tx as unknown as DynamicClient;
                  results.push(await txTarget[operation.operation](...operation.args));
                }
                return results;
              }
              : null;
          if (!runner) return transaction(input, options);
          return transaction(async (tx: Prisma.TransactionClient) => {
            await assertExecutionWriteAllowed(tx, true);
            return runWithExecutionScope({ writeFenceHeld: true }, async () => {
              const result = await runner(tx);
              await assertExecutionWriteAllowed(tx, true);
              return result;
            });
          }, options);
        };
      }
      const value = Reflect.get(target, property, receiver);
      if (typeof property !== "string") return value;
      if (property.startsWith("$") && typeof value === "function") {
        return (...args: unknown[]) => remember(value.apply(target, args), { operation: property, args });
      }
      if (value && typeof value === "object" && typeof value.findMany === "function") {
        const cached = delegateCache.get(property);
        if (cached && cached.source === value) return cached.delegate;
        const delegate = new Proxy(value, {
          get(model, operation) {
            const method = Reflect.get(model, operation);
            if (typeof method !== "function" || typeof operation !== "string") return method;
            return (...args: unknown[]) => remember(method.apply(model, args), { delegate: property, operation, args });
          },
        });
        delegateCache.set(property, { source: value, delegate });
        return delegate;
      }
      return value;
    },
  }) as unknown as PrismaClient;
}
