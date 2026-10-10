import { awaitsAcceptance, canEnter, opensCompany } from "../membership-entry.js";

const NOW = new Date("2026-08-12T10:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const daysBefore = (days: number): Date => new Date(NOW.getTime() - days * DAY_MS);

const LIVE = { invitedAt: daysBefore(1), acceptedAt: null };
const EXPIRED = { invitedAt: daysBefore(21), acceptedAt: null };
const ACCEPTED_LONG_AGO = { invitedAt: daysBefore(400), acceptedAt: daysBefore(399) };

/**
 * La règle d'entrée par rattachement (2026-10-10, §8.1 bis). Régression : une
 * invitation expirée ouvrait encore sa société à qui se connectait par code.
 */
describe("opensCompany", () => {
  it("ouvre un rattachement accepté, quel que soit l'âge de son invitation", () => {
    expect(opensCompany(ACCEPTED_LONG_AGO, NOW)).toBe(true);
  });

  it("ouvre une invitation vivante non acceptée", () => {
    expect(opensCompany(LIVE, NOW)).toBe(true);
  });

  it("🔴 n'ouvre pas une invitation expirée non acceptée", () => {
    expect(opensCompany(EXPIRED, NOW)).toBe(false);
  });
});

describe("awaitsAcceptance", () => {
  it("attend l'acceptation d'une invitation vivante", () => {
    expect(awaitsAcceptance(LIVE, NOW)).toBe(true);
  });

  it("n'accepte ni l'expirée, ni le déjà accepté", () => {
    expect(awaitsAcceptance(EXPIRED, NOW)).toBe(false);
    expect(awaitsAcceptance(ACCEPTED_LONG_AGO, NOW)).toBe(false);
  });
});

describe("canEnter", () => {
  it("laisse entrer si UN rattachement accueille", () => {
    expect(canEnter([EXPIRED, LIVE], NOW)).toBe(true);
  });

  it("🔴 refuse si toutes les invitations ont expiré", () => {
    expect(canEnter([EXPIRED], NOW)).toBe(false);
  });

  it("refuse sans aucun rattachement : rien où entrer", () => {
    expect(canEnter([], NOW)).toBe(false);
  });
});
