import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { LoyaltyVoucher } from "../../../domain/entities/loyalty-voucher.js";
import {
  LoyaltyVoucherNotUsableError,
  LoyaltyVoucherUnknownError,
} from "../../../domain/errors/loyalty-errors.js";
import { LoyaltyHolder } from "../../../domain/value-objects/loyalty-holder.js";
import { LoyaltySettings } from "../../../domain/value-objects/loyalty-settings.js";
import {
  FixedHolders,
  InMemoryVouchers,
  OPEN_TO_PUBLIC,
  RecordingLock,
} from "../../commands/__tests__/loyalty-doubles.js";
import { LoyaltyVoucherQuoting } from "../loyalty-voucher-quoting.js";
import { LoyaltyVoucherRedeeming } from "../loyalty-voucher-redeeming.js";

// Les instants ne sont comparés qu'entre eux et à la date limite du bon.
const ISSUED = new Date("2026-01-10T09:00:00.000Z");
const DAY = 86_400_000;
const BEFORE_EXPIRY = new Date(ISSUED.getTime() + DAY);
const AFTER_EXPIRY = new Date(ISSUED.getTime() + 60 * DAY);
const ORDER = { id: "o1", number: "ORD-1" };

/** Un bon de 1 000 centimes, valable 30 jours, à la personne `u1`. */
function setup(status: "available" | "reserved" = "available") {
  const vouchers = new InMemoryVouchers();
  const voucher = LoyaltyVoucher.issue({
    id: "v1",
    holder: LoyaltyHolder.of("user", "u1"),
    steps: 2,
    settings: LoyaltySettings.of({ ...OPEN_TO_PUBLIC, voucherValidityDays: 30 }),
    issuedAt: ISSUED,
  });
  if (status === "reserved") {
    voucher.reserve(BEFORE_EXPIRY);
  }
  vouchers.rows.set(voucher.id, voucher.toPersistence());
  const events = new RecordingPublisher();
  const redeeming = new LoyaltyVoucherRedeeming(
    vouchers,
    new RecordingLock(vouchers.calls),
    new FixedHolders({ "user:u1": "Léa Martin" }),
    new FixedIdGenerator("rem"),
    events,
    new DirectUnitOfWork(),
  );
  return { vouchers, events, redeeming, quoting: new LoyaltyVoucherQuoting(vouchers) };
}

describe("LoyaltyVoucherQuoting — ce que vaut un bon, sans rien engager", () => {
  it("rend la valeur HT d'un bon disponible de la personne", async () => {
    const { quoting, vouchers } = setup();
    await expect(quoting.quote("v1", "u1", BEFORE_EXPIRY)).resolves.toEqual({
      id: "v1",
      valueCents: 1_000,
    });
    expect(vouchers.calls).toEqual([]);
  });

  it("un bon d'autrui se lit comme un bon inexistant", async () => {
    const { quoting } = setup();
    await expect(quoting.quote("v1", "u2", BEFORE_EXPIRY)).rejects.toBeInstanceOf(
      LoyaltyVoucherUnknownError,
    );
    await expect(quoting.quote("nope", "u1", BEFORE_EXPIRY)).rejects.toBeInstanceOf(
      LoyaltyVoucherUnknownError,
    );
  });

  it("refuse un bon déjà engagé", async () => {
    const { quoting } = setup("reserved");
    await expect(quoting.quote("v1", "u1", BEFORE_EXPIRY)).rejects.toBeInstanceOf(
      LoyaltyVoucherNotUsableError,
    );
  });
});

describe("LoyaltyVoucherRedeeming — réserver", () => {
  it("prend le verrou du titulaire AVANT de relire et de sauver", async () => {
    const { redeeming, vouchers } = setup();
    await redeeming.reserve("v1", "u1", BEFORE_EXPIRY);
    expect(vouchers.calls).toEqual(["lock:user:u1", "voucher.save"]);
    expect(vouchers.rows.get("v1")?.status).toBe("reserved");
  });

  it("refuse la seconde réservation du même bon, sans rien sauver", async () => {
    const { redeeming, vouchers } = setup("reserved");
    await expect(redeeming.reserve("v1", "u1", BEFORE_EXPIRY)).rejects.toBeInstanceOf(
      LoyaltyVoucherNotUsableError,
    );
    expect(vouchers.calls).toEqual(["lock:user:u1"]);
  });

  it("refuse le bon d'une autre personne", async () => {
    const { redeeming } = setup();
    await expect(redeeming.reserve("v1", "u2", BEFORE_EXPIRY)).rejects.toBeInstanceOf(
      LoyaltyVoucherUnknownError,
    );
  });
});

describe("LoyaltyVoucherRedeeming — libérer", () => {
  it("rend le bon disponible, sans fait au journal", async () => {
    const { redeeming, vouchers, events } = setup("reserved");
    await redeeming.release("v1", BEFORE_EXPIRY);
    expect(vouchers.rows.get("v1")?.status).toBe("available");
    expect(events.factTypes()).toEqual([]);
  });

  it("après sa date limite, le bon passe expiré et le journal le dit", async () => {
    const { redeeming, vouchers, events } = setup("reserved");
    await redeeming.release("v1", AFTER_EXPIRY);
    expect(vouchers.rows.get("v1")).toMatchObject({ status: "expired", expiredAt: AFTER_EXPIRY });
    expect(events.factTypes()).toEqual(["loyalty.voucher_expired"]);
  });
});

describe("LoyaltyVoucherRedeeming — solder le reliquat", () => {
  it("émet le reliquat et le journalise", async () => {
    const { redeeming, vouchers, events } = setup("reserved");
    await redeeming.settleRemainder(
      { voucherId: "v1", appliedCents: 400, order: ORDER },
      BEFORE_EXPIRY,
    );
    const child = [...vouchers.rows.values()].find((row) => row.parentVoucherId === "v1");
    expect(child).toMatchObject({ valueCents: 600, pointsCost: 0, status: "available" });
    expect(events.factTypes()).toEqual(["loyalty.voucher_remainder_issued"]);
  });

  it("rejoué, n'émet pas un second reliquat", async () => {
    const { redeeming, vouchers, events } = setup("reserved");
    const settlement = { voucherId: "v1", appliedCents: 400, order: ORDER };
    await redeeming.settleRemainder(settlement, BEFORE_EXPIRY);
    await redeeming.settleRemainder(settlement, BEFORE_EXPIRY);
    expect([...vouchers.rows.values()].filter((row) => row.parentVoucherId === "v1")).toHaveLength(
      1,
    );
    expect(events.factTypes()).toEqual(["loyalty.voucher_remainder_issued"]);
  });

  it("n'émet rien quand le bon a tout imputé, mais le marque soldé", async () => {
    const { redeeming, vouchers, events } = setup("reserved");
    await redeeming.settleRemainder(
      { voucherId: "v1", appliedCents: 1_000, order: ORDER },
      BEFORE_EXPIRY,
    );
    expect(vouchers.rows.size).toBe(1);
    expect(vouchers.rows.get("v1")?.remainderSettledAt).toEqual(BEFORE_EXPIRY);
    expect(events.factTypes()).toEqual([]);
  });

  it("échu, le reliquat s'éteint : aucun bon, un seul fait, même rejoué", async () => {
    const { redeeming, vouchers, events } = setup("reserved");
    await redeeming.settleRemainder(
      { voucherId: "v1", appliedCents: 400, order: ORDER },
      AFTER_EXPIRY,
    );
    await redeeming.settleRemainder(
      { voucherId: "v1", appliedCents: 400, order: ORDER },
      AFTER_EXPIRY,
    );
    expect(vouchers.rows.size).toBe(1);
    expect(events.factTypes()).toEqual(["loyalty.voucher_remainder_lapsed"]);
  });
});
