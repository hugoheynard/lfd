import type { CategoryNode, SyncOrderTimeLimitRule } from "@lfd/catalog-sync";

import type { OrderLimitChange, OrderLimitTarget } from "../../order-limit-descent.js";
import { CatalogOrderLimits } from "../catalog-order-limits.js";

/**
 * Le double de la descente des limites (lot 2b) : une échelle, un arbre et
 * des articles tenus en mémoire ; il retient ce qui a été lu et réécrit.
 * Hérite du port, comme les autres doubles du dépôt.
 */
export class RecordingOrderLimits extends CatalogOrderLimits {
  readonly asked: (string | null)[] = [];
  readonly written: OrderLimitChange[] = [];

  constructor(
    private readonly held: readonly SyncOrderTimeLimitRule[] | null = null,
    private readonly tree: readonly CategoryNode[] = [],
    private readonly items: readonly OrderLimitTarget[] = [],
  ) {
    super();
  }

  rules(): Promise<readonly SyncOrderTimeLimitRule[] | null> {
    return Promise.resolve(this.held);
  }

  categories(): Promise<readonly CategoryNode[]> {
    return Promise.resolve(this.tree);
  }

  targets(productId: string | null): Promise<readonly OrderLimitTarget[]> {
    this.asked.push(productId);
    return Promise.resolve(
      this.items.filter((item) => productId === null || item.productId === productId),
    );
  }

  write(changes: readonly OrderLimitChange[]): Promise<void> {
    this.written.push(...changes);
    return Promise.resolve();
  }
}
