import type { OrderStatus } from "@lfd/contracts";

import {
  OneOrderReader,
  view,
} from "../../../orders/application/handlers/__tests__/order-placed-mail-doubles.js";
import { OrderAccessReader } from "../../../orders/domain/ports/order-access.reader.js";
import type { OrderRole } from "../../../orders/domain/ports/order-guard.reader.js";
import {
  OrderNoticeSummaryReader,
  type OrderNoticeSummary,
} from "../../../orders/domain/ports/order-notice-summary.reader.js";
import type { OwnedOrder } from "../../../orders/domain/ports/order.reader.js";
import { AT_PLACEMENT } from "../../../orders/domain/services/order-sheet.js";
import { OrderReportableOrderReader } from "../order-reportable-order.reader.js";

const BUYER = "usr_buyer";

class NoRole extends OrderAccessReader {
  accessToOrder(): Promise<OrderRole | null> {
    return Promise.resolve(null);
  }
}

class NoSummary extends OrderNoticeSummaryReader {
  summaryOf(): Promise<OrderNoticeSummary | null> {
    return Promise.resolve(null);
  }
}

function personal(status: OrderStatus): OwnedOrder {
  return {
    view: view({ id: "ord_1", status, companyId: null }),
    companyId: null,
    placedByUserId: BUYER,
    stripePaymentIntentId: null,
    clientele: "pro",
    loyaltyVoucherId: null,
    billedCustomer: null,
    buyerPhone: null,
    revision: AT_PLACEMENT,
  };
}

async function fulfilledOf(status: OrderStatus): Promise<boolean | undefined> {
  const reader = new OrderReportableOrderReader(
    new OneOrderReader(personal(status)),
    new NoRole(),
    new NoSummary(),
  );
  return (await reader.visibleTo("ord_1", BUYER))?.fulfilled;
}

describe("OrderReportableOrderReader — ce qui se signale", () => {
  it.each([
    ["fulfilled", true],
    // Plan E7 reliquat (L5a) : une partie reçue se signale déjà.
    ["partially_handed_over", true],
    ["ready", false],
    ["placed", false],
  ] as const)("%s → signalable : %s", async (status, expected) => {
    expect(await fulfilledOf(status)).toBe(expected);
  });
});
