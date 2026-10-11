import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { WelcomeCandidateFacts } from "../../../domain/ports/welcome-candidate.reader.js";
import { LoyaltyHolder } from "../../../domain/value-objects/loyalty-holder.js";
import type {
  LoyaltySettingsInput,
  LoyaltySettingsMilestones,
} from "../../../domain/value-objects/loyalty-settings.js";
import { WelcomeBonusCrediting } from "../../services/welcome-bonus-crediting.js";
import { CreditWelcomeBonusCommand } from "../credit-welcome-bonus.command.js";
import { CreditWelcomeBonusHandler } from "../credit-welcome-bonus.handler.js";
import {
  FixedHolders,
  FixedLoyaltySettings,
  InMemoryLedger,
  OPEN_TO_PUBLIC,
} from "./loyalty-doubles.js";
import { FixedWelcomeCandidates, LedgerWelcomed, RacingWelcomeLedger } from "./welcome-doubles.js";

const NOW = new Date("2026-01-10T09:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;
const SINCE = new Date(NOW.getTime() - HOUR_MS);
const BONUS: LoyaltySettingsInput = { ...OPEN_TO_PUBLIC, welcomeBonusPoints: 500 };
const MILESTONES: LoyaltySettingsMilestones = { publicOpenedAt: SINCE, welcomeBonusSince: SINCE };

const NEWCOMER: WelcomeCandidateFacts = { userId: "u1", becameAccountAt: NOW, addressProven: true };

function setup(
  people: readonly WelcomeCandidateFacts[] = [NEWCOMER],
  settings: LoyaltySettingsInput | null = BONUS,
  ledger: InMemoryLedger = new InMemoryLedger(),
) {
  const events = new RecordingPublisher();
  const crediting = new WelcomeBonusCrediting(
    new FixedWelcomeCandidates(people, ledger),
    new LedgerWelcomed(ledger),
    ledger,
    new FixedHolders({ "user:u1": "Léa Martin" }),
    new FixedIdGenerator("welcome"),
    new FixedClock(NOW),
    events,
    new DirectUnitOfWork(),
  );
  const handler = new CreditWelcomeBonusHandler(
    new FixedLoyaltySettings(settings, MILESTONES),
    crediting,
  );
  return { ledger, events, handler };
}

const credit = (userId = "u1") => new CreditWelcomeBonusCommand(userId);

describe("CreditWelcomeBonusHandler — le bonus d'une personne qui devient un compte", () => {
  it("écrit la ligne `welcome` au montant du réglage, sous le verrou, et la trace", async () => {
    const { ledger, events, handler } = setup();

    expect(await handler.execute(credit())).toBe(true);

    expect(ledger.entries).toEqual([
      expect.objectContaining({
        kind: "welcome",
        points: 500,
        holder: LoyaltyHolder.of("user", "u1"),
        occurredAt: NOW,
      }),
    ]);
    // Le verrou d'abord, la relecture de la ligne ensuite, l'écriture enfin.
    expect(ledger.calls).toEqual(["lock:user:u1", "welcomed?:u1", "ledger.save"]);
    expect(events.traced.map((event) => event.journalFact())).toEqual([
      {
        type: "loyalty.welcome_bonus_credited",
        subjectType: "user",
        subjectId: "u1",
        payload: { subjectLabel: "Léa Martin", points: 500 },
      },
    ]);
  });

  it("déjà crédité : relu sous le verrou, rien de plus", async () => {
    const { ledger, events, handler } = setup();
    await handler.execute(credit());

    expect(await handler.execute(credit())).toBe(false);
    expect(ledger.entries).toHaveLength(1);
    expect(events.traced).toHaveLength(1);
  });

  it("l'index unique refuse une seconde ligne : « déjà fait », pas une panne", async () => {
    const { events, handler } = setup([NEWCOMER], BONUS, new RacingWelcomeLedger());

    expect(await handler.execute(credit())).toBe(false);
    expect(events.traced).toEqual([]);
  });

  it("adresse non prouvée : ne verrouille rien, n'écrit rien", async () => {
    const { ledger, handler } = setup([{ ...NEWCOMER, addressProven: false }]);

    expect(await handler.execute(credit())).toBe(false);
    expect(ledger.calls).toEqual([]);
  });

  it("bonus éteint, ou programme fermé : rien", async () => {
    const off = setup([NEWCOMER], { ...BONUS, welcomeBonusPoints: null });
    const closed = setup([NEWCOMER], null);

    expect(await off.handler.execute(credit())).toBe(false);
    expect(await closed.handler.execute(credit())).toBe(false);
    expect([...off.ledger.calls, ...closed.ledger.calls]).toEqual([]);
  });

  it("une personne inconnue : rien", async () => {
    const { ledger, handler } = setup([]);

    expect(await handler.execute(credit("u_inconnu"))).toBe(false);
    expect(ledger.entries).toEqual([]);
  });
});
