import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  InvalidLoyaltyRatioError,
  InvalidWelcomeBonusError,
  LoyaltyProNotYetOpenableError,
} from "../../../domain/errors/loyalty-errors.js";
import type {
  LoyaltySettingsInput,
  LoyaltySettingsMilestones,
} from "../../../domain/value-objects/loyalty-settings.js";
import { SetLoyaltySettingsCommand } from "../set-loyalty-settings.command.js";
import { SetLoyaltySettingsHandler } from "../set-loyalty-settings.handler.js";
import {
  FixedLoyaltySettings,
  OPEN_TO_PUBLIC,
  RecordingSettingsWriter,
} from "./loyalty-doubles.js";

const NOW = new Date("2026-01-10T09:00:00.000Z");
/** Un instant antérieur à `NOW` — comparé à lui seul, jamais à l'horloge. */
const EARLIER = new Date("2025-12-01T09:00:00.000Z");
const NONE: LoyaltySettingsMilestones = { publicOpenedAt: null, welcomeBonusSince: null };

function run(
  current: LoyaltySettingsInput | null,
  next: LoyaltySettingsInput,
  milestones: LoyaltySettingsMilestones = NONE,
) {
  const writer = new RecordingSettingsWriter();
  const events = new RecordingPublisher();
  const handler = new SetLoyaltySettingsHandler(
    new FixedLoyaltySettings(current, milestones),
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
    expect(writer.written).toEqual([
      {
        settings: OPEN_TO_PUBLIC,
        milestones: { publicOpenedAt: NOW, welcomeBonusSince: null },
        at: NOW,
        by: "staff_1",
      },
    ]);
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

  describe("la première ouverture au public (R4)", () => {
    it("n'est pas posée tant que le public reste fermé", async () => {
      const { writer, done } = run(null, { ...OPEN_TO_PUBLIC, openToPublic: false });
      await done;
      expect(writer.written[0]?.milestones.publicOpenedAt).toBeNull();
    });

    it("est posée quand le public s'ouvre pour la première fois", async () => {
      const closed = { ...OPEN_TO_PUBLIC, openToPublic: false };
      const { writer, done } = run(closed, OPEN_TO_PUBLIC);
      await done;
      expect(writer.written[0]?.milestones.publicOpenedAt).toEqual(NOW);
    });

    it("n'est ni déplacée par une réouverture, ni effacée par une fermeture", async () => {
      const opened = { publicOpenedAt: EARLIER, welcomeBonusSince: null };
      const closing = run(OPEN_TO_PUBLIC, { ...OPEN_TO_PUBLIC, openToPublic: false }, opened);
      await closing.done;
      expect(closing.writer.written[0]?.milestones.publicOpenedAt).toEqual(EARLIER);

      const closed = { ...OPEN_TO_PUBLIC, openToPublic: false };
      const reopening = run(closed, OPEN_TO_PUBLIC, opened);
      await reopening.done;
      expect(reopening.writer.written[0]?.milestones.publicOpenedAt).toEqual(EARLIER);
    });
  });

  describe("le bonus de bienvenue", () => {
    it("pose `welcomeBonusSince` quand le bonus passe de aucun à un nombre, et le trace", async () => {
      const { writer, events, done } = run(OPEN_TO_PUBLIC, {
        ...OPEN_TO_PUBLIC,
        welcomeBonusPoints: 500,
      });
      await done;
      expect(writer.written[0]?.settings.welcomeBonusPoints).toBe(500);
      expect(writer.written[0]?.milestones.welcomeBonusSince).toEqual(NOW);
      expect(events.traced[0]?.journalFact()).toMatchObject({
        payload: { welcomeBonusPoints: 500 },
      });
    });

    it("garde l'instant quand on change un montant déjà actif", async () => {
      const active = { ...OPEN_TO_PUBLIC, welcomeBonusPoints: 500 };
      const { writer, done } = run(
        active,
        { ...active, welcomeBonusPoints: 800 },
        { publicOpenedAt: EARLIER, welcomeBonusSince: EARLIER },
      );
      await done;
      expect(writer.written[0]?.milestones.welcomeBonusSince).toEqual(EARLIER);
    });

    it("repose l'instant quand on rallume un bonus éteint", async () => {
      const { writer, done } = run(
        OPEN_TO_PUBLIC,
        { ...OPEN_TO_PUBLIC, welcomeBonusPoints: 300 },
        { publicOpenedAt: EARLIER, welcomeBonusSince: EARLIER },
      );
      await done;
      expect(writer.written[0]?.milestones.welcomeBonusSince).toEqual(NOW);
    });

    it("refuse un bonus nul ou fractionnaire, et n'écrit rien", async () => {
      const { writer, done } = run(null, { ...OPEN_TO_PUBLIC, welcomeBonusPoints: 0 });
      await expect(done).rejects.toBeInstanceOf(InvalidWelcomeBonusError);
      expect(writer.written).toEqual([]);
    });
  });
});
