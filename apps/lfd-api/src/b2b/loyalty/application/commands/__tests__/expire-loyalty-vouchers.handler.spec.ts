import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { LoyaltyVoucher } from "../../../domain/entities/loyalty-voucher.js";
import { LoyaltyHolder } from "../../../domain/value-objects/loyalty-holder.js";
import { LoyaltySettings } from "../../../domain/value-objects/loyalty-settings.js";
import { ExpireLoyaltyVouchersHandler } from "../expire-loyalty-vouchers.handler.js";
import { FixedHolders, InMemoryVouchers, OPEN_TO_PUBLIC } from "./loyalty-doubles.js";

const ISSUED = new Date("2026-01-10T09:00:00.000Z");
const DAY = 86_400_000;

function voucher(id: string, validityDays: number): LoyaltyVoucher {
  return LoyaltyVoucher.issue({
    id,
    holder: LoyaltyHolder.of("user", "u1"),
    steps: 1,
    settings: LoyaltySettings.of({ ...OPEN_TO_PUBLIC, voucherValidityDays: validityDays }),
    issuedAt: ISSUED,
  });
}

describe("ExpireLoyaltyVouchersHandler — l'état écrit rejoint l'état lu", () => {
  it("n'expire que les bons disponibles passé leur date, un fait chacun", async () => {
    const vouchers = new InMemoryVouchers();
    vouchers.rows.set("due", voucher("due", 1).toPersistence());
    vouchers.rows.set("fresh", voucher("fresh", 30).toPersistence());
    const events = new RecordingPublisher();
    const handler = new ExpireLoyaltyVouchersHandler(
      vouchers,
      new FixedHolders({ "user:u1": "Léa Martin" }),
      new FixedClock(new Date(ISSUED.getTime() + 2 * DAY)),
      events,
      new DirectUnitOfWork(),
    );

    expect(await handler.execute()).toBe(1);
    expect(vouchers.rows.get("due")?.status).toBe("expired");
    expect(vouchers.rows.get("fresh")?.status).toBe("available");
    expect(events.factTypes()).toEqual(["loyalty.voucher_expired"]);
    expect(await handler.execute()).toBe(0);
  });
});
