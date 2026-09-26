import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  InvalidLoyaltyRatioError,
  LoyaltyProNotYetOpenableError,
} from "../../../domain/errors/loyalty-errors.js";
import type { LoyaltySettingsInput } from "../../../domain/value-objects/loyalty-settings.js";
import { SetLoyaltySettingsCommand } from "../set-loyalty-settings.command.js";
import { SetLoyaltySettingsHandler } from "../set-loyalty-settings.handler.js";
import {
  FixedLoyaltySettings,
  OPEN_TO_PUBLIC,
  RecordingSettingsWriter,
} from "./loyalty-doubles.js";

const NOW = new Date("2026-01-10T09:00:00.000Z");

function run(current: LoyaltySettingsInput | null, next: LoyaltySettingsInput) {
  const writer = new RecordingSettingsWriter();
  const events = new RecordingPublisher();
  const handler = new SetLoyaltySettingsHandler(
    new FixedLoyaltySettings(current),
    writer,
    new FixedClock(NOW),
    events,
    new DirectUnitOfWork(),
  );
  return { writer, events, done: handler.execute(new SetLoyaltySettingsCommand(next, "staff_1")) };
}

describe("SetLoyaltySettingsHandler — le réglage du programme", () => {
  it("ouvre le programme : écrit le réglage, daté et signé, et le trace", async () => {
    const { writer, events, done } = run(null, OPEN_TO_PUBLIC);
    await done;
    expect(writer.written).toEqual([{ settings: OPEN_TO_PUBLIC, at: NOW, by: "staff_1" }]);
    expect(events.traced[0]?.journalFact()).toMatchObject({
      type: "loyalty_settings.set",
      subjectType: "loyalty_settings",
      payload: { pointsPerStep: 1_000, stepValueCents: 500, voucherValidityDays: 365 },
    });
  });

  it("un réglage inchangé n'écrit ni ne trace rien", async () => {
    const { writer, events, done } = run(OPEN_TO_PUBLIC, OPEN_TO_PUBLIC);
    await done;
    expect(writer.written).toEqual([]);
    expect(events.traced).toEqual([]);
  });

  it("refuse un ratio qui n'est pas fait d'entiers positifs", async () => {
    const { writer, done } = run(null, { ...OPEN_TO_PUBLIC, stepValueCents: 0 });
    await expect(done).rejects.toThrow(InvalidLoyaltyRatioError);
    expect(writer.written).toEqual([]);
  });

  /**
   * Chez un pro, « pas de paiement requis » veut dire « payé à terme » : ouvrir
   * les pros sans signal « facture réglée » créditerait des commandes non
   * encaissées. L'écran ne le propose pas ; le serveur le refuse quand même.
   */
  it("refuse d'ouvrir la clientèle pro, et n'écrit rien", async () => {
    const { writer, events, done } = run(null, { ...OPEN_TO_PUBLIC, openToPro: true });
    await expect(done).rejects.toBeInstanceOf(LoyaltyProNotYetOpenableError);
    expect(writer.written).toEqual([]);
    expect(events.traced).toEqual([]);
  });
});
