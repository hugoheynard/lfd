import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  LoyaltyLedgerReader,
  type LoyaltyBalanceRow,
  type LoyaltyVoucherRow,
} from "../../../domain/ports/loyalty-ledger.reader.js";
import { ListLoyaltyVouchersHandler } from "../list-loyalty-vouchers.handler.js";
import { FixedVoucherOrders, voucherOrder } from "../../commands/__tests__/loyalty-doubles.js";

const ISSUED = new Date("2026-01-10T09:00:00.000Z");
const EXPIRES = new Date("2026-02-10T09:00:00.000Z");

class FixedLedger extends LoyaltyLedgerReader {
  constructor(private readonly vouchers: readonly LoyaltyVoucherRow[]) {
    super();
  }

  listBalances(): Promise<readonly LoyaltyBalanceRow[]> {
    return Promise.resolve([]);
  }

  listVouchers(): Promise<readonly LoyaltyVoucherRow[]> {
    return Promise.resolve(this.vouchers);
  }
}

const ROW: LoyaltyVoucherRow = {
  id: "v1",
  holder: { kind: "user", id: "u1", label: null },
  valueCents: 500,
  pointsCost: 1_000,
  ratioPointsPerStep: 1_000,
  ratioStepValueCents: 500,
  issuedAt: ISSUED,
  expiresAt: EXPIRES,
  status: "available",
  cancelledAt: null,
  cancellationReason: null,
};

describe("ListLoyaltyVouchersHandler — l'état se lit à l'horloge", () => {
  it("lit « disponible » avant la date limite", async () => {
    const handler = new ListLoyaltyVouchersHandler(
      new FixedLedger([ROW]),
      new FixedClock(ISSUED),
      new FixedVoucherOrders(),
    );
    expect((await handler.execute())[0]).toMatchObject({
      status: "available",
      ratio: { pointsPerStep: 1_000, stepValueCents: 500 },
      expiresAt: EXPIRES.toISOString(),
    });
  });

  it("lit « expiré » un bon disponible passé sa date, avant même qu'on l'écrive", async () => {
    const handler = new ListLoyaltyVouchersHandler(
      new FixedLedger([ROW]),
      new FixedClock(EXPIRES),
      new FixedVoucherOrders(),
    );
    expect((await handler.execute())[0]?.status).toBe("expired");
  });

  it("laisse un bon annulé annulé", async () => {
    const cancelled = {
      ...ROW,
      status: "cancelled" as const,
      cancelledAt: ISSUED,
      cancellationReason: "x",
    };
    const handler = new ListLoyaltyVouchersHandler(
      new FixedLedger([cancelled]),
      new FixedClock(EXPIRES),
      new FixedVoucherOrders(),
    );
    expect((await handler.execute())[0]).toMatchObject({
      status: "cancelled",
      cancellationReason: "x",
    });
  });

  /**
   * Plan des points, §11 bis S6 : faute d'état `used`, un bon réservé dit la
   * commande vivante qui l'engage. Un bon réservé ne se lit jamais expiré.
   */
  it("dit sur quelle commande un bon réservé est engagé, même passé sa date", async () => {
    const reserved = { ...ROW, status: "reserved" as const };
    const handler = new ListLoyaltyVouchersHandler(
      new FixedLedger([reserved, { ...ROW, id: "v2" }]),
      new FixedClock(EXPIRES),
      new FixedVoucherOrders([voucherOrder({ orderId: "o9", orderNumber: "ORD-9" })]),
    );
    const views = await handler.execute();
    expect(views[0]).toMatchObject({
      status: "reserved",
      usedOn: { orderId: "o9", orderNumber: "ORD-9" },
    });
    expect(views[1]?.usedOn).toBeNull();
  });
});
