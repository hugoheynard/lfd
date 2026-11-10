import { LoyaltyHolder } from "../../value-objects/loyalty-holder.js";
import {
  LoyaltySettings,
  type LoyaltySettingsInput,
} from "../../value-objects/loyalty-settings.js";
import { welcomeBonusFor, type WelcomeCandidate } from "../welcome-bonus.js";

// Les dates ne sont comparées qu'entre elles (le bonus allumé, le compte ouvert) :
// la règle ne lit pas l'horloge.
const SINCE = new Date("2026-03-01T10:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;

const WITH_BONUS: LoyaltySettingsInput = {
  pointsPerStep: 1_000,
  stepValueCents: 500,
  openToPublic: true,
  openToPro: false,
  voucherValidityDays: 365,
  welcomeBonusPoints: 500,
};
const ACTIVE = LoyaltySettings.of(WITH_BONUS, { publicOpenedAt: SINCE, welcomeBonusSince: SINCE });

const NEWCOMER: WelcomeCandidate = {
  userId: "u1",
  becameAccountAt: SINCE,
  addressProven: true,
  accountDisabled: false,
  alreadyWelcomed: false,
};

describe("welcomeBonusFor — le bonus de bienvenue, une fois par personne", () => {
  it("dû à qui est devenu un compte à l'instant même où le bonus s'allume, au montant du réglage", () => {
    expect(welcomeBonusFor(NEWCOMER, ACTIVE)).toEqual({
      kind: "welcome",
      holder: LoyaltyHolder.of("user", "u1"),
      points: 500,
    });
  });

  it("dû aussi après", () => {
    const later = { ...NEWCOMER, becameAccountAt: new Date(SINCE.getTime() + HOUR_MS) };
    expect(welcomeBonusFor(later, ACTIVE).kind).toBe("welcome");
  });

  describe("(a) le réglage", () => {
    it("programme fermé : rien", () => {
      expect(welcomeBonusFor(NEWCOMER, null)).toEqual({ kind: "skip", reason: "program_closed" });
    });

    it("programme fermé au public : rien", () => {
      const closed = LoyaltySettings.of(
        { ...WITH_BONUS, openToPublic: false },
        { publicOpenedAt: SINCE, welcomeBonusSince: SINCE },
      );
      expect(welcomeBonusFor(NEWCOMER, closed)).toEqual({
        kind: "skip",
        reason: "clientele_closed",
      });
    });

    it("bonus éteint : rien", () => {
      const off = LoyaltySettings.of(
        { ...WITH_BONUS, welcomeBonusPoints: null },
        { publicOpenedAt: SINCE, welcomeBonusSince: SINCE },
      );
      expect(welcomeBonusFor(NEWCOMER, off)).toEqual({ kind: "skip", reason: "bonus_off" });
    });

    it("un montant sans instant d'allumage n'a pas de borne : rien", () => {
      expect(welcomeBonusFor(NEWCOMER, LoyaltySettings.of(WITH_BONUS))).toEqual({
        kind: "skip",
        reason: "bonus_off",
      });
    });
  });

  describe("(b) devenu un compte depuis l'allumage", () => {
    it("un invité (jamais devenu compte) : rien", () => {
      expect(welcomeBonusFor({ ...NEWCOMER, becameAccountAt: null }, ACTIVE)).toEqual({
        kind: "skip",
        reason: "not_an_account",
      });
    });

    it("devenu compte bonus éteint : rien, même allumé depuis", () => {
      const before = { ...NEWCOMER, becameAccountAt: new Date(SINCE.getTime() - 1) };
      expect(welcomeBonusFor(before, ACTIVE)).toEqual({ kind: "skip", reason: "before_bonus" });
    });
  });

  it("(c) adresse non prouvée : rien", () => {
    expect(welcomeBonusFor({ ...NEWCOMER, addressProven: false }, ACTIVE)).toEqual({
      kind: "skip",
      reason: "address_unproven",
    });
  });

  /** Hugo, 2026-10-11 : un compte désactivé par le staff ne reçoit pas de bonus. */
  it("compte désactivé : rien", () => {
    expect(welcomeBonusFor({ ...NEWCOMER, accountDisabled: true }, ACTIVE)).toEqual({
      kind: "skip",
      reason: "account_disabled",
    });
  });

  it("(d) déjà crédité : rien", () => {
    expect(welcomeBonusFor({ ...NEWCOMER, alreadyWelcomed: true }, ACTIVE)).toEqual({
      kind: "skip",
      reason: "already_welcomed",
    });
  });
});
