import { Logger } from "@nestjs/common";

import type { CallFallbackReason, CallGuardListener } from "./bounded-call-guard.js";

/**
 * **Les replis d'un cache nommé, en journaux structurés** — au niveau `warn` :
 * un repli, c'est une donnée relue en base, et un disjoncteur ouvert, un cache
 * qui ne sert plus. Le champ `metric` (`<cache>.fallback`…) est stable.
 */
export class LoggingCallGuardListener<
  Operation extends string,
> implements CallGuardListener<Operation> {
  private readonly logger: Logger;

  constructor(private readonly cache: string) {
    this.logger = new Logger(`CacheCall:${cache}`);
  }

  fallback(operation: Operation, reason: CallFallbackReason): void {
    this.logger.warn({
      message: `Cache ${this.cache} : repli sur la base`,
      metric: `${this.cache}.fallback`,
      operation,
      reason,
    });
  }

  breakerOpened(failures: number): void {
    this.logger.warn({
      message: `Cache ${this.cache} : disjoncteur ouvert`,
      metric: `${this.cache}.breaker_opened`,
      failures,
    });
  }

  breakerClosed(): void {
    this.logger.log({
      message: `Cache ${this.cache} : disjoncteur refermé`,
      metric: `${this.cache}.breaker_closed`,
    });
  }
}
