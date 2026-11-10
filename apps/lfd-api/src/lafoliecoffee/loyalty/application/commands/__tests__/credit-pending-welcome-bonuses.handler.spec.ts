import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { WelcomeCandidateFacts } from "../../../domain/ports/welcome-candidate.reader.js";
import type { LoyaltySettingsInput } from "../../../domain/value-objects/loyalty-settings.js";
import { WelcomeBonusCrediting } from "../../services/welcome-bonus-crediting.js";
import {
  CreditPendingWelcomeBonusesHandler,
  WELCOME_BATCH,
} from "../credit-pending-welcome-bonuses.handler.js";
import {
  FixedHolders,
  FixedLoyaltySettings,
  InMemoryLedger,
  OPEN_TO_PUBLIC,
} from "./loyalty-doubles.js";
import { FixedWelcomeCandidates, LedgerWelcomed } from "./welcome-doubles.js";

const NOW = new Date("2026-01-10T09:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;
const SINCE = new Date(NOW.getTime() - HOUR_MS);
const BONUS: LoyaltySettingsInput = { ...OPEN_TO_PUBLIC, welcomeBonusPoints: 500 };

function person(userId: string, overrides: Partial<WelcomeCandidateFacts> = {}) {
  return {
    userId,
    becameAccountAt: NOW,
    addressProven: true,
    accountDisabled: false,
    ...overrides,
  };
}

function setup(
  people: readonly WelcomeCandidateFacts[],
  settings: LoyaltySettingsInput | null = BONUS,
) {
  const ledger = new InMemoryLedger();
  const candidates = new FixedWelcomeCandidates(people, ledger);
  const crediting = new WelcomeBonusCrediting(
    candidates,
    new LedgerWelcomed(ledger),
    ledger,
    new FixedHolders({}),
    new FixedIdGenerator("welcome"),
    new FixedClock(NOW),
    new RecordingPublisher(),
    new DirectUnitOfWork(),
  );
  const handler = new CreditPendingWelcomeBonusesHandler(
    candidates,
    new FixedLoyaltySettings(settings, { publicOpenedAt: SINCE, welcomeBonusSince: SINCE }),
    crediting,
  );
  return { ledger, candidates, handler };
}

describe("CreditPendingWelcomeBonusesHandler — la passe de nuit du bonus", () => {
  it("crédite les comptes ouverts depuis l'allumage, adresse prouvée — pas les autres", async () => {
    const { ledger, handler } = setup([
      person("u1"),
      person("u2", { addressProven: false }),
      person("u3", { becameAccountAt: new Date(SINCE.getTime() - 1) }),
    ]);

    expect(await handler.execute()).toEqual({ scanned: 1, credited: 1 });
    expect(ledger.entries.map((entry) => entry.holder.id)).toEqual(["u1"]);
  });

  it("parcourt par lots bornés, et un second passage n'écrit rien", async () => {
    const people = Array.from({ length: WELCOME_BATCH + 1 }, (_, index) =>
      person(`u${String(index).padStart(4, "0")}`),
    );
    const { candidates, handler } = setup(people);

    expect(await handler.execute()).toEqual({
      scanned: WELCOME_BATCH + 1,
      credited: WELCOME_BATCH + 1,
    });
    expect(candidates.pages).toHaveLength(2);
    expect(await handler.execute()).toEqual({ scanned: 0, credited: 0 });
  });

  it.each([
    ["programme fermé", null],
    ["fermé au public", { ...BONUS, openToPublic: false }],
    ["bonus éteint", { ...BONUS, welcomeBonusPoints: null }],
  ])("%s : ne parcourt rien", async (_, settings) => {
    const { candidates, handler } = setup([person("u1")], settings);

    expect(await handler.execute()).toEqual({ scanned: 0, credited: 0 });
    expect(candidates.pages).toEqual([]);
  });
});
