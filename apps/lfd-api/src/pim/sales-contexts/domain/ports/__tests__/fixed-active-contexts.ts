import type { SalesContext } from "../../value-objects/sales-context.js";
import { ActiveSalesContextsReader } from "../active-sales-contexts.reader.js";

/**
 * Le double des contextes en service (lot 2b) : une liste de clés, tenue en
 * mémoire. Hérite du port, comme les autres doubles du dépôt.
 */
export class FixedActiveContexts extends ActiveSalesContextsReader {
  constructor(private readonly keys: readonly string[]) {
    super();
  }

  /** Les trois contextes du semis, tous en service. */
  static all(): FixedActiveContexts {
    return new FixedActiveContexts(["takeaway", "eatIn", "b2b"]);
  }

  active(): Promise<readonly SalesContext[]> {
    return Promise.resolve(
      this.keys.map((key, position) => ({
        id: `ctx_${key}`,
        key,
        label: key,
        handleSuffix: "",
        active: true,
        shopifyProjected: false,
        position,
      })),
    );
  }
}
