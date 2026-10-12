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
import type { VoucherOrder } from "../../../../orders/domain/ports/voucher-order.reader.js";
import {
  FixedHolders,
  FixedVoucherOrders,
  InMemoryVouchers,
  OPEN_TO_PUBLIC,
  RecordingLock,
  voucherOrder,
} from "../../commands/__tests__/loyalty-doubles.js";
import { LoyaltyVoucherQuoting } from "../loyalty-voucher-quoting.js";
import { LoyaltyVoucherRedeeming } from "../loyalty-voucher-redeeming.js";

// Les instants ne sont comparés qu'entre eux et à la date limite du bon.
const ISSUED = new Date("2026-01-10T09:00:00.000Z");
const DAY = 86_400_000;
const BEFORE_EXPIRY = new Date(ISSUED.getTime() + DAY);
const AFTER_EXPIRY = new Date(ISSUED.getTime() + 60 * DAY);
const ORDER = { id: "o1", number: "CMD-1" };

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
  // Les commandes vivantes qui portent des bons : `o1` porte `v1`, payée.
  // Mutable : une annulation la retire, une passation en ajoute.
  const live: VoucherOrder[] = [voucherOrder()];
  const redeeming = new LoyaltyVoucherRedeeming(
    vouchers,
    new RecordingLock(vouchers.calls),
    new FixedHolders({ "user:u1": "Léa Martin" }),
    new FixedIdGenerator("rem"),
    events,
    new DirectUnitOfWork(),
    new FixedVoucherOrders(live),
  );
  return { vouchers, events, redeeming, live, quoting: new LoyaltyVoucherQuoting(vouchers) };
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

describe("LoyaltyVoucherRedeeming — solder relit la commande sous le verrou (C3b.1, 4)", () => {
  it("ne solde rien si la commande du lot ne porte plus le bon", async () => {
    const { redeeming, vouchers, events, live } = setup("reserved");
    live.splice(0, live.length, voucherOrder({ orderId: "o2", orderNumber: "CMD-2" }));

    await redeeming.settleRemainder(
      { voucherId: "v1", appliedCents: 400, order: ORDER },
      BEFORE_EXPIRY,
    );

    expect(vouchers.rows.size).toBe(1);
    expect(vouchers.rows.get("v1")?.remainderSettledAt).toBeNull();
    expect(events.factTypes()).toEqual([]);
  });

  it("ne solde rien sur une commande au règlement en suspens", async () => {
    const { redeeming, vouchers, live } = setup("reserved");
    live.splice(0, live.length, voucherOrder({ paymentStatus: "pending" }));

    await redeeming.settleRemainder(
      { voucherId: "v1", appliedCents: 400, order: ORDER },
      BEFORE_EXPIRY,
    );

    expect(vouchers.rows.get("v1")?.remainderSettledAt).toBeNull();
  });
});

/** `v1` engagé sur `o1`, soldé en laissant un reliquat de 600 ; puis `o1` annulée. */
async function settledThenCancelled() {
  const scene = setup("reserved");
  await scene.redeeming.settleRemainder(
    { voucherId: "v1", appliedCents: 400, order: ORDER },
    BEFORE_EXPIRY,
  );
  scene.live.splice(0, scene.live.length);
  const child = [...scene.vouchers.rows.values()].find((row) => row.parentVoucherId === "v1");
  if (child === undefined) {
    throw new TypeError("le reliquat aurait dû naître");
  }
  scene.events.traced.length = 0;
  scene.events.published.length = 0;
  scene.vouchers.calls.length = 0;
  return { ...scene, childId: child.id };
}

describe("LoyaltyVoucherRedeeming — restituer (lot C3b)", () => {
  it("rendu tel quel : sous le verrou, le parent revient, un fait `voucher_reinstated`", async () => {
    const { redeeming, vouchers, events, live } = setup("reserved");
    live.splice(0, live.length);

    await expect(redeeming.reinstate("v1", ORDER, BEFORE_EXPIRY)).resolves.toEqual({
      kind: "returned",
      voucherValueCents: 1_000,
      remainderValueCents: null,
      expiresAt: new Date(ISSUED.getTime() + 30 * DAY),
    });
    expect(vouchers.calls).toEqual(["lock:user:u1", "voucher.save"]);
    expect(vouchers.rows.get("v1")?.status).toBe("available");
    expect(events.factTypes()).toEqual(["loyalty.voucher_reinstated"]);
  });

  it("refondu : le reliquat passe `merged_back`, le parent retrouve sa valeur sans marque", async () => {
    const { redeeming, vouchers, events, childId } = await settledThenCancelled();

    const outcome = await redeeming.reinstate("v1", ORDER, BEFORE_EXPIRY);

    expect(outcome).toMatchObject({
      kind: "merged",
      voucherValueCents: 1_000,
      remainderValueCents: 600,
    });
    expect(vouchers.rows.get(childId)).toMatchObject({
      status: "merged_back",
      mergedBackAt: BEFORE_EXPIRY,
      mergedBackOrderId: "o1",
    });
    expect(vouchers.rows.get("v1")).toMatchObject({
      status: "available",
      remainderSettledAt: null,
    });
    expect(events.factTypes()).toEqual(["loyalty.voucher_reinstated"]);
    expect(events.traced[0]?.journalFact().payload).toMatchObject({
      outcome: "merged",
      remainderCents: 600,
    });
  });

  it("échu : parent et reliquat écrits expirés, deux faits d'expiration, rien de rendu", async () => {
    const { redeeming, vouchers, events, childId } = await settledThenCancelled();

    const outcome = await redeeming.reinstate("v1", ORDER, AFTER_EXPIRY);

    expect(outcome.kind).toBe("lapsed");
    expect(vouchers.rows.get("v1")?.status).toBe("expired");
    expect(vouchers.rows.get(childId)?.status).toBe("expired");
    expect(events.factTypes()).toEqual(["loyalty.voucher_expired", "loyalty.voucher_expired"]);
  });

  it("reliquat engagé ailleurs : `blocked` nomme la commande lue au port, rien n'est écrit", async () => {
    const { redeeming, vouchers, events, live, childId } = await settledThenCancelled();
    const child = vouchers.rows.get(childId);
    if (child !== undefined) {
      vouchers.rows.set(childId, { ...child, status: "reserved" });
    }
    live.push(voucherOrder({ voucherId: childId, orderId: "o2", orderNumber: "CMD-2" }));

    await expect(redeeming.reinstate("v1", ORDER, BEFORE_EXPIRY)).resolves.toEqual({
      kind: "blocked",
      cause: "remainder_engaged",
      remainderValueCents: 600,
      order: { id: "o2", number: "CMD-2" },
    });
    expect(vouchers.calls).toEqual(["lock:user:u1"]);
    expect(events.factTypes()).toEqual([]);
  });

  it("parent réengagé par une AUTRE commande : `already`, rien n'est écrit ni publié", async () => {
    const { redeeming, vouchers, events, live } = setup("reserved");
    live.splice(0, live.length, voucherOrder({ orderId: "o9", orderNumber: "CMD-9" }));

    await expect(redeeming.reinstate("v1", ORDER, BEFORE_EXPIRY)).resolves.toEqual({
      kind: "already",
    });
    expect(vouchers.calls).toEqual(["lock:user:u1"]);
    expect(events.factTypes()).toEqual([]);
  });

  it("rejoué après la refusion : `already`, aucun fait de plus", async () => {
    const { redeeming, events } = await settledThenCancelled();
    await redeeming.reinstate("v1", ORDER, BEFORE_EXPIRY);

    await expect(redeeming.reinstate("v1", ORDER, BEFORE_EXPIRY)).resolves.toEqual({
      kind: "already",
    });
    expect(events.factTypes()).toEqual(["loyalty.voucher_reinstated"]);
  });
});
