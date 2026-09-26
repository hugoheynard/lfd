import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  InsufficientLoyaltyPointsError,
  LoyaltyConversionForbiddenError,
  LoyaltyHolderNotFoundError,
  LoyaltyProgramClosedError,
  LoyaltyProgramClosedToClienteleError,
} from "../../../domain/errors/loyalty-errors.js";
import { LoyaltyHolder } from "../../../domain/value-objects/loyalty-holder.js";
import type { LoyaltySettingsInput } from "../../../domain/value-objects/loyalty-settings.js";
import { ConvertLoyaltyPointsCommand } from "../convert-loyalty-points.command.js";
import { ConvertLoyaltyPointsHandler } from "../convert-loyalty-points.handler.js";
import {
  FixedGate,
  FixedHolders,
  FixedLoyaltySettings,
  InMemoryLedger,
  InMemoryVouchers,
  OPEN_TO_PUBLIC,
} from "./loyalty-doubles.js";

const NOW = new Date("2026-01-10T09:00:00.000Z");
const PERSON = LoyaltyHolder.of("user", "u1");
const COMPANY = LoyaltyHolder.of("company", "c1");

function setup(settings: LoyaltySettingsInput | null = OPEN_TO_PUBLIC) {
  const ledger = new InMemoryLedger();
  const vouchers = new InMemoryVouchers();
  const events = new RecordingPublisher();
  const handler = new ConvertLoyaltyPointsHandler(
    new FixedLoyaltySettings(settings),
    ledger,
    vouchers,
    new FixedGate(["user:u1>u1", "company:c1>u2"]),
    new FixedHolders({ "user:u1": "Léa Martin", "company:c1": "Boulangerie Dupont" }),
    new FixedIdGenerator("id"),
    new FixedClock(NOW),
    events,
    new DirectUnitOfWork(),
  );
  return { ledger, vouchers, events, handler };
}

describe("ConvertLoyaltyPointsHandler — des points contre un bon", () => {
  it("prend le verrou, écrit le bon puis le débit, et trace l'émission", async () => {
    const { ledger, vouchers, events, handler } = setup();
    ledger.seedEarned(PERSON, 2_340);

    const voucherId = await handler.execute(new ConvertLoyaltyPointsCommand("user", "u1", "u1", 2));

    expect(ledger.calls).toEqual(["lock:user:u1", "ledger.save"]);
    expect(vouchers.calls).toEqual(["voucher.save"]);
    expect(vouchers.rows.get(voucherId)).toMatchObject({ valueCents: 1_000, pointsCost: 2_000 });
    expect(ledger.balanceOf(PERSON)).toBe(340);
    expect(events.traced[0]?.journalFact()).toMatchObject({
      type: "loyalty.voucher_issued",
      subjectType: "user",
      subjectId: "u1",
      payload: { subjectLabel: "Léa Martin", valueCents: 1_000, pointsCost: 2_000 },
    });
  });

  it("🔴 refuse, programme fermé, tant qu'aucun réglage n'est posé — et n'écrit rien", async () => {
    const { ledger, vouchers, events, handler } = setup(null);
    ledger.seedEarned(PERSON, 10_000);

    await expect(
      handler.execute(new ConvertLoyaltyPointsCommand("user", "u1", "u1", 1)),
    ).rejects.toThrow(LoyaltyProgramClosedError);
    expect(vouchers.rows.size).toBe(0);
    expect(events.traced).toEqual([]);
  });

  it("refuse une société tant que la clientèle pro est fermée", async () => {
    const { ledger, handler } = setup();
    ledger.seedEarned(COMPANY, 10_000);
    await expect(
      handler.execute(new ConvertLoyaltyPointsCommand("company", "c1", "u2", 1)),
    ).rejects.toThrow(LoyaltyProgramClosedToClienteleError);
  });

  it("laisse un membre de la société convertir quand la clientèle pro est ouverte", async () => {
    const { ledger, handler } = setup({ ...OPEN_TO_PUBLIC, openToPro: true });
    ledger.seedEarned(COMPANY, 1_000);
    await handler.execute(new ConvertLoyaltyPointsCommand("company", "c1", "u2", 1));
    expect(ledger.balanceOf(COMPANY)).toBe(0);
  });

  it("refuse une personne qui n'est ni le titulaire ni un membre", async () => {
    const { ledger, handler } = setup();
    ledger.seedEarned(PERSON, 10_000);
    await expect(
      handler.execute(new ConvertLoyaltyPointsCommand("user", "u1", "intrus", 1)),
    ).rejects.toThrow(LoyaltyConversionForbiddenError);
  });

  it("refuse un solde insuffisant", async () => {
    const { ledger, handler } = setup();
    ledger.seedEarned(PERSON, 999);
    await expect(
      handler.execute(new ConvertLoyaltyPointsCommand("user", "u1", "u1", 1)),
    ).rejects.toThrow(InsufficientLoyaltyPointsError);
  });

  it("refuse un titulaire inconnu", async () => {
    const { handler } = setup();
    await expect(
      handler.execute(new ConvertLoyaltyPointsCommand("user", "fantome", "fantome", 1)),
    ).rejects.toThrow(LoyaltyHolderNotFoundError);
  });
});
