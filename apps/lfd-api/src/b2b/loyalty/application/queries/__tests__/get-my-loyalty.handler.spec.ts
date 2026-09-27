import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { OrderNumberReader } from "../../../../orders/domain/ports/order-number.reader.js";
import {
  HolderLoyaltyReader,
  type HolderEntryRow,
  type HolderVoucherRow,
} from "../../../domain/ports/holder-loyalty.reader.js";
import type { LoyaltyHolder } from "../../../domain/value-objects/loyalty-holder.js";
import type { LoyaltySettingsInput } from "../../../domain/value-objects/loyalty-settings.js";
import {
  FixedLoyaltySettings,
  FixedVoucherOrders,
  OPEN_TO_PUBLIC,
  voucherOrder,
} from "../../commands/__tests__/loyalty-doubles.js";
import { GetMyLoyaltyHandler } from "../get-my-loyalty.handler.js";
import { GetMyLoyaltyQuery } from "../get-my-loyalty.query.js";

// Comparées à la seule horloge figée du test, jamais au mur.
const NOW = new Date("2026-03-01T09:00:00.000Z");
const BEFORE = new Date("2026-02-01T09:00:00.000Z");
const LATER = new Date("2026-04-01T09:00:00.000Z");

/** Le livre d'UNE personne, `u1` : un autre titulaire ne lit rien. */
class FixedHolderReader extends HolderLoyaltyReader {
  readonly asked: string[] = [];

  constructor(
    private readonly balance: number,
    private readonly entries: readonly HolderEntryRow[] = [],
    private readonly live: readonly HolderVoucherRow[] = [],
    private readonly closed: readonly HolderVoucherRow[] = [],
  ) {
    super();
  }

  balanceOf(holder: LoyaltyHolder): Promise<number> {
    this.asked.push(holder.lockKey);
    return Promise.resolve(this.mine(holder) ? this.balance : 0);
  }

  recentEntries(holder: LoyaltyHolder, limit: number): Promise<readonly HolderEntryRow[]> {
    return Promise.resolve(this.mine(holder) ? this.entries.slice(0, limit) : []);
  }

  liveVouchers(holder: LoyaltyHolder): Promise<readonly HolderVoucherRow[]> {
    return Promise.resolve(this.mine(holder) ? this.live : []);
  }

  recentClosedVouchers(holder: LoyaltyHolder, limit: number): Promise<readonly HolderVoucherRow[]> {
    return Promise.resolve(this.mine(holder) ? this.closed.slice(0, limit) : []);
  }

  private mine(holder: LoyaltyHolder): boolean {
    return holder.kind === "user" && holder.id === "u1";
  }
}

class FixedOrderNumbers extends OrderNumberReader {
  numbersOf(orderIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
    return Promise.resolve(new Map(orderIds.map((id) => [id, `CMD-${id}`])));
  }
}

function voucher(overrides: Partial<HolderVoucherRow>): HolderVoucherRow {
  return {
    id: "v1",
    valueCents: 500,
    issuedAt: BEFORE,
    expiresAt: LATER,
    status: "available",
    ...overrides,
  };
}

function setup(reader: FixedHolderReader, settings: LoyaltySettingsInput | null = OPEN_TO_PUBLIC) {
  return new GetMyLoyaltyHandler(
    new FixedLoyaltySettings(settings),
    reader,
    new FixedVoucherOrders([voucherOrder({ voucherId: "v2", orderNumber: "CMD-42" })]),
    new FixedOrderNumbers(),
    new FixedClock(NOW),
  );
}

describe("GetMyLoyaltyHandler — la fidélité d'un particulier", () => {
  it("rend le solde, le ratio d'aujourd'hui et les paliers convertibles", async () => {
    const view = await setup(new FixedHolderReader(2_340)).execute(
      new GetMyLoyaltyQuery("u1", null),
    );
    expect(view).toEqual({
      open: true,
      balancePoints: 2_340,
      pointsPerStep: 1_000,
      stepValueCents: 500,
      convertibleSteps: 2,
      vouchers: [],
      entries: [],
    });
  });

  it("se dit fermée sans réglage, et ne lit rien du livre", async () => {
    const reader = new FixedHolderReader(2_340);
    const view = await setup(reader, null).execute(new GetMyLoyaltyQuery("u1", null));
    expect(view).toEqual({ open: false });
    expect(reader.asked).toEqual([]);
  });

  it("se dit fermée quand le programme n'est pas ouvert au public", async () => {
    const view = await setup(new FixedHolderReader(2_340), {
      ...OPEN_TO_PUBLIC,
      openToPublic: false,
    }).execute(new GetMyLoyaltyQuery("u1", null));
    expect(view).toEqual({ open: false });
  });

  it("🔴 se dit fermée depuis un espace société (lot F), et ne lit rien", async () => {
    const reader = new FixedHolderReader(2_340);
    const view = await setup(reader).execute(new GetMyLoyaltyQuery("u1", "c1"));
    expect(view).toEqual({ open: false });
    expect(reader.asked).toEqual([]);
  });

  it("lit le livre de la personne du principal, et d'elle seule", async () => {
    const reader = new FixedHolderReader(2_340);
    await setup(reader).execute(new GetMyLoyaltyQuery("u1", null));
    expect(reader.asked).toEqual(["user:u1"]);
  });

  it("range les bons vivants d'abord, et fait rejoindre les clos à un bon échu", async () => {
    const reader = new FixedHolderReader(
      0,
      [],
      [
        voucher({ id: "v1" }),
        voucher({ id: "v2", status: "reserved" }),
        voucher({ id: "v3", expiresAt: BEFORE }),
      ],
      [voucher({ id: "v4", status: "cancelled", issuedAt: NOW })],
    );
    const view = await setup(reader).execute(new GetMyLoyaltyQuery("u1", null));
    if (!view.open) {
      throw new TypeError("ouverte attendue");
    }
    expect(view.vouchers.map((v) => [v.id, v.status])).toEqual([
      ["v1", "available"],
      ["v2", "reserved"],
      ["v4", "cancelled"],
      ["v3", "expired"],
    ]);
    expect(view.vouchers[1]?.usedOn).toEqual({ orderId: "o1", orderNumber: "CMD-42" });
    expect(view.vouchers[0]?.usedOn).toBeNull();
  });

  it("nomme la commande d'un gain, et ne laisse sortir aucun motif staff", async () => {
    const reader = new FixedHolderReader(1_000, [
      { id: "e2", kind: "adjusted", points: 200, occurredAt: NOW, orderId: null },
      { id: "e1", kind: "earned", points: 800, occurredAt: BEFORE, orderId: "o9" },
    ]);
    const view = await setup(reader).execute(new GetMyLoyaltyQuery("u1", null));
    if (!view.open) {
      throw new TypeError("ouverte attendue");
    }
    expect(view.entries).toEqual([
      {
        id: "e2",
        kind: "adjusted",
        points: 200,
        occurredAt: NOW.toISOString(),
        orderNumber: null,
      },
      {
        id: "e1",
        kind: "earned",
        points: 800,
        occurredAt: BEFORE.toISOString(),
        orderNumber: "CMD-o9",
      },
    ]);
  });
});
