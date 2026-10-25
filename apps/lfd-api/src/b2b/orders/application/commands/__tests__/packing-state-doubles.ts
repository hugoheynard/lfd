import {
  OrderPackingStateReader,
  type OrderPackingState,
} from "../../../../../packing/channels/commerce/index.js";
import { CancellationAllowanceGate } from "../../services/cancellation-allowance-gate.js";
import { CancellationPreview } from "../../services/cancellation-preview.js";
import type { CancellationRule } from "../../services/cancellation-rule.js";

/**
 * L'état au colisage, donné d'avance : commande → `packed` | `withdrawn`
 * (plan A1, lot A1.3). `asked` garde chaque lot demandé, pour éprouver qu'on
 * ne demande rien avant l'inscription.
 */
export class FixedPackingStates extends OrderPackingStateReader {
  readonly asked: (readonly string[])[] = [];

  constructor(private readonly states: Readonly<Record<string, OrderPackingState>> = {}) {
    super();
  }

  packedAmong(orderIds: readonly string[]): Promise<ReadonlyMap<string, OrderPackingState>> {
    this.asked.push(orderIds);
    const known = orderIds.flatMap((id) => {
      const state = this.states[id];
      return state === undefined ? [] : [[id, state] as const];
    });
    return Promise.resolve(new Map(known));
  }
}

/** L'aperçu, monté sur la règle et le réglage du test. */
export function previewOf(
  rule: CancellationRule,
  allowances: CancellationAllowanceGate,
  packing: OrderPackingStateReader = new FixedPackingStates(),
): CancellationPreview {
  return new CancellationPreview(rule, allowances, packing);
}
