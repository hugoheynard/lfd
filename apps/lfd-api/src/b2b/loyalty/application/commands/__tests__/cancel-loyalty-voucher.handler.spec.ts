import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  LoyaltyVoucherExpiredError,
  LoyaltyVoucherNotAvailableError,
  LoyaltyVoucherNotFoundError,
} from "../../../domain/errors/loyalty-errors.js";
import { LoyaltyAccount } from "../../../domain/entities/loyalty-account.js";
import { LoyaltyHolder } from "../../../domain/value-objects/loyalty-holder.js";
import { LoyaltySettings } from "../../../domain/value-objects/loyalty-settings.js";
import { CancelLoyaltyVoucherCommand } from "../cancel-loyalty-voucher.command.js";
import { CancelLoyaltyVoucherHandler } from "../cancel-loyalty-voucher.handler.js";
import {
  FixedHolders,
  InMemoryLedger,
  InMemoryVouchers,
  OPEN_TO_PUBLIC,
} from "./loyalty-doubles.js";

const ISSUED = new Date("2026-01-10T09:00:00.000Z");
const DAY = 86_400_000;
const PERSON = LoyaltyHolder.of("user", "u1");

/** Un bon de 2 paliers, converti depuis 2 000 points — le livre est à zéro. */
function setup(now: Date = ISSUED) {
  const ledger = new InMemoryLedger();
  const vouchers = new InMemoryVouchers();
  ledger.seedEarned(PERSON, 2_000);
  const account = LoyaltyAccount.reconstitute(PERSON, 2_000);
  const voucher = account.convert({
    steps: 2,
    settings: LoyaltySettings.of({ ...OPEN_TO_PUBLIC, voucherValidityDays: 30 }),
    voucherId: "v1",
    entryId: "conv1",
    actorUserId: "u1",
    at: ISSUED,
  });
  ledger.entries.push(...account.pendingEntries);
  vouchers.rows.set(voucher.id, voucher.toPersistence());
  const events = new RecordingPublisher();
  const handler = new CancelLoyaltyVoucherHandler(
    vouchers,
    ledger,
    new FixedHolders({ "user:u1": "Léa Martin" }),
    new FixedIdGenerator("adj"),
    new FixedClock(now),
    events,
    new DirectUnitOfWork(),
  );
  return { ledger, vouchers, events, handler };
}

describe("CancelLoyaltyVoucherHandler — annuler un bon rend ses points", () => {
  it("annule le bon, recrédite son coût par une ligne liée, et trace les deux faits", async () => {
    const { ledger, vouchers, events, handler } = setup();
    expect(ledger.balanceOf(PERSON)).toBe(0);

    await handler.execute(new CancelLoyaltyVoucherCommand("v1", "erreur de conversion", "staff_1"));

    expect(vouchers.rows.get("v1")).toMatchObject({
      status: "cancelled",
      cancelledByStaffId: "staff_1",
    });
    expect(ledger.balanceOf(PERSON)).toBe(2_000);
    expect(ledger.entries.at(-1)).toMatchObject({
      kind: "adjusted",
      points: 2_000,
      voucherId: "v1",
    });
    expect(events.factTypes()).toEqual(["loyalty.voucher_cancelled", "loyalty.points_adjusted"]);
  });

  it("🔴 ne recrédite qu'une fois : la seconde annulation est refusée", async () => {
    const { ledger, handler } = setup();
    await handler.execute(new CancelLoyaltyVoucherCommand("v1", "erreur", "staff_1"));
    await expect(
      handler.execute(new CancelLoyaltyVoucherCommand("v1", "erreur", "staff_1")),
    ).rejects.toThrow(LoyaltyVoucherNotAvailableError);
    expect(ledger.balanceOf(PERSON)).toBe(2_000);
  });

  it("refuse un bon passé sa date limite : ses points ne reviennent pas", async () => {
    const { ledger, handler } = setup(new Date(ISSUED.getTime() + 30 * DAY));
    await expect(
      handler.execute(new CancelLoyaltyVoucherCommand("v1", "trop tard", "staff_1")),
    ).rejects.toThrow(LoyaltyVoucherExpiredError);
    expect(ledger.balanceOf(PERSON)).toBe(0);
  });

  it("rend un 404 pour un bon inconnu", async () => {
    const { handler } = setup();
    await expect(
      handler.execute(new CancelLoyaltyVoucherCommand("absent", "erreur", "staff_1")),
    ).rejects.toThrow(LoyaltyVoucherNotFoundError);
  });
});
