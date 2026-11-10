import type { VoucherRestitution } from "../../../orders/domain/ports/loyalty-voucher-redemption.js";
import type { VoucherOrderReader } from "../../../orders/domain/ports/voucher-order.reader.js";
import type { LoyaltyVoucher } from "../../domain/entities/loyalty-voucher.js";
import { LoyaltyRemainderCarrierMissingError } from "../../domain/errors/voucher-restitution-errors.js";
import type { RestitutionIssue } from "../../domain/services/voucher-restitution.js";

/**
 * L'issue de la restitution (lot C3b), mise dans la forme que la commande lit
 * — partagée par le geste ({@link LoyaltyVoucherRedeeming.reinstate}) et
 * l'aperçu ({@link LoyaltyVoucherRestitutionPreviewing}), qui disent donc la
 * même chose.
 *
 * Pour un reliquat engagé (cas 5), la commande qui le porte se lit par le port
 * que la commande publie pour la fidélité (`VoucherOrderReader`).
 *
 * @throws {LoyaltyRemainderCarrierMissingError} reliquat engagé sans commande vivante.
 */
export async function restitutionOf(
  issue: RestitutionIssue<LoyaltyVoucher>,
  parent: LoyaltyVoucher,
  orders: VoucherOrderReader,
): Promise<VoucherRestitution> {
  switch (issue.kind) {
    case "already":
      return { kind: "already" };
    case "blocked":
      return blockedOf(issue.cause, issue.remainder, orders);
    case "returned":
      return valued("returned", parent, null);
    case "merged":
    case "lapsed":
      return valued(issue.kind, parent, issue.remainder);
  }
}

function valued(
  kind: "returned" | "merged" | "lapsed",
  parent: LoyaltyVoucher,
  remainder: LoyaltyVoucher | null,
): VoucherRestitution {
  return {
    kind,
    voucherValueCents: parent.valueCents,
    remainderValueCents: remainder?.valueCents ?? null,
    expiresAt: parent.expiresAt,
  };
}

async function blockedOf(
  cause: "remainder_engaged" | "remainder_cancelled",
  remainder: LoyaltyVoucher,
  orders: VoucherOrderReader,
): Promise<VoucherRestitution> {
  if (cause === "remainder_cancelled") {
    return { kind: "blocked", cause, remainderValueCents: remainder.valueCents };
  }
  const carrier = (await orders.liveOrdersCarrying([remainder.id])).get(remainder.id);
  if (carrier === undefined) {
    throw new LoyaltyRemainderCarrierMissingError(remainder.id);
  }
  return {
    kind: "blocked",
    cause,
    remainderValueCents: remainder.valueCents,
    order: { id: carrier.orderId, number: carrier.orderNumber },
  };
}
