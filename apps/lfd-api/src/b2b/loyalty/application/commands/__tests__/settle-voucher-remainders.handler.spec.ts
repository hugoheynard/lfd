import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  StaffNotifier,
  type StaffNotice,
} from "../../../../../staff/notifications/domain/ports/staff-notifier.js";
import { LoyaltyVoucher } from "../../../domain/entities/loyalty-voucher.js";
import { LoyaltyHolder } from "../../../domain/value-objects/loyalty-holder.js";
import { LoyaltySettings } from "../../../domain/value-objects/loyalty-settings.js";
import { LoyaltyVoucherRedeeming } from "../../services/loyalty-voucher-redeeming.js";
import { SettleVoucherRemaindersHandler } from "../settle-voucher-remainders.handler.js";
import {
  FixedHolders,
  FixedVoucherOrders,
  InMemoryVouchers,
  OPEN_TO_PUBLIC,
  RecordingLock,
  voucherOrder,
} from "./loyalty-doubles.js";
import type { VoucherOrder } from "../../../../orders/domain/ports/voucher-order.reader.js";

// Les instants sont comparés à la date limite du bon et au jour de service de
// la commande — tous deux fixés ici, jamais à l'horloge murale.
const ISSUED = new Date("2026-01-10T09:00:00.000Z");
const DAY = 86_400_000;
const NIGHT = new Date(ISSUED.getTime() + 5 * DAY);
const AFTER_EXPIRY = new Date(ISSUED.getTime() + 60 * DAY);

class RecordingNotifier extends StaffNotifier {
  readonly notices: StaffNotice[] = [];

  notify(notices: readonly StaffNotice[]): Promise<void> {
    this.notices.push(...notices);
    return Promise.resolve();
  }
}

/** Un bon de 1 000 centimes, valable 30 jours, engagé sur la commande donnée. */
function setup(order: VoucherOrder | null, now: Date = NIGHT) {
  const vouchers = new InMemoryVouchers();
  const voucher = LoyaltyVoucher.issue({
    id: "v1",
    holder: LoyaltyHolder.of("user", "u1"),
    steps: 2,
    settings: LoyaltySettings.of({ ...OPEN_TO_PUBLIC, voucherValidityDays: 30 }),
    issuedAt: ISSUED,
  });
  voucher.reserve(ISSUED);
  vouchers.rows.set(voucher.id, voucher.toPersistence());
  const events = new RecordingPublisher();
  const notifier = new RecordingNotifier();
  const handler = new SettleVoucherRemaindersHandler(
    vouchers,
    new FixedVoucherOrders(order === null ? [] : [order]),
    new LoyaltyVoucherRedeeming(
      vouchers,
      new RecordingLock(vouchers.calls),
      new FixedHolders({ "user:u1": "Léa Martin" }),
      new FixedIdGenerator("rem"),
      events,
      new DirectUnitOfWork(),
    ),
    notifier,
    new FixedClock(now),
  );
  return { handler, vouchers, events, notifier };
}

describe("SettleVoucherRemaindersHandler — le rattrapage de nuit des bons", () => {
  it("émet le reliquat d'une commande payée", async () => {
    const { handler, vouchers, events } = setup(voucherOrder({ voucherDiscountCents: 300 }));

    await expect(handler.execute()).resolves.toEqual({ reserved: 1, settled: 1, stalled: 0 });

    const child = [...vouchers.rows.values()].find((row) => row.parentVoucherId === "v1");
    expect(child?.valueCents).toBe(700);
    expect(events.factTypes()).toEqual(["loyalty.voucher_remainder_issued"]);
  });

  it("rejoué, ne repasse pas par un bon qui a son reliquat", async () => {
    const { handler, vouchers } = setup(voucherOrder());

    await handler.execute();
    await expect(handler.execute()).resolves.toEqual({ reserved: 0, settled: 0, stalled: 0 });

    expect([...vouchers.rows.values()].filter((row) => row.parentVoucherId === "v1")).toHaveLength(
      1,
    );
  });

  it("sonne, sans rien libérer, pour une commande ni payée ni annulée passé son jour", async () => {
    const { handler, vouchers, notifier } = setup(
      voucherOrder({ paymentStatus: "failed", serviceDay: "2026-01-12" }),
    );

    await expect(handler.execute()).resolves.toEqual({ reserved: 1, settled: 0, stalled: 1 });

    expect(vouchers.rows.get("v1")?.status).toBe("reserved");
    expect(notifier.notices).toHaveLength(1);
    expect(notifier.notices[0]).toMatchObject({
      kind: "loyalty.voucher_stalled",
      link: "/commandes/o1",
      idempotencyKey: "notification:loyalty.voucher_stalled:v1:o1",
    });
  });

  it("ne sonne pas avant le jour de service", async () => {
    const { handler, notifier } = setup(
      voucherOrder({ paymentStatus: "pending", serviceDay: "2026-01-20" }),
    );

    await handler.execute();

    expect(notifier.notices).toEqual([]);
  });

  /** Plan §11 bis B2 : un bon échu entre le paiement et la nuit s'éteint, une seule fois. */
  it("un bon payé mais échu : aucun reliquat, un seul fait, la nuit suivante est silencieuse", async () => {
    const { handler, vouchers, events } = setup(voucherOrder(), AFTER_EXPIRY);

    await expect(handler.execute()).resolves.toEqual({ reserved: 1, settled: 1, stalled: 0 });
    await expect(handler.execute()).resolves.toEqual({ reserved: 0, settled: 0, stalled: 0 });

    expect(vouchers.rows.size).toBe(1);
    expect(events.factTypes()).toEqual(["loyalty.voucher_remainder_lapsed"]);
  });

  it("un bon entièrement imputé est marqué soldé, et n'est plus relu", async () => {
    const { handler, vouchers } = setup(voucherOrder({ voucherDiscountCents: 1_000 }));

    await handler.execute();
    await expect(handler.execute()).resolves.toEqual({ reserved: 0, settled: 0, stalled: 0 });

    expect(vouchers.rows.size).toBe(1);
    expect(vouchers.rows.get("v1")?.remainderSettledAt).toEqual(NIGHT);
  });

  it("un bon réservé sans commande vivante n'écrit rien", async () => {
    const { handler, vouchers } = setup(null);

    await expect(handler.execute()).resolves.toEqual({ reserved: 1, settled: 0, stalled: 0 });

    expect(vouchers.calls).toEqual([]);
  });
});
