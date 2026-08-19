import {
  INVITATION_LIFETIME_DAYS,
  invitationExpiresAt,
  isInvitationExpired,
} from "../invitation-expiry.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const INVITED_AT = new Date("2026-08-01T10:00:00.000Z");

/**
 * La règle a **deux** usagers — le contact d'une société et le membre de
 * l'équipe — et personne ne verrait qu'ils divergent : chacun afficherait une
 * date plausible, simplement pas la même. D'où ces tests sur la seule chose qui
 * compte vraiment ici, **la borne**.
 */
describe("isInvitationExpired", () => {
  it("laisse vivre une invitation d'hier", () => {
    const now = new Date(INVITED_AT.getTime() + DAY_MS);

    expect(isInvitationExpired(INVITED_AT, now)).toBe(false);
  });

  it("laisse vivre à la milliseconde exacte de l'échéance", () => {
    // La borne est inclusive côté vie : un accès ne se ferme pas sur une
    // égalité d'horloge, et l'écart entre deux serveurs suffirait à trancher
    // différemment de part et d'autre.
    const now = invitationExpiresAt(INVITED_AT);

    expect(isInvitationExpired(INVITED_AT, now)).toBe(false);
  });

  it("périme une milliseconde après", () => {
    const now = new Date(invitationExpiresAt(INVITED_AT).getTime() + 1);

    expect(isInvitationExpired(INVITED_AT, now)).toBe(true);
  });

  it("périme largement au-delà", () => {
    const now = new Date(INVITED_AT.getTime() + 30 * DAY_MS);

    expect(isInvitationExpired(INVITED_AT, now)).toBe(true);
  });

  it("ne périme pas une invitation datée du futur", () => {
    // Horloge de travers ou date semée à la main : mieux vaut un accès qui
    // vit trop longtemps qu'un accès fermé par une pendule mal réglée.
    const future = new Date(INVITED_AT.getTime() + DAY_MS);

    expect(isInvitationExpired(future, INVITED_AT)).toBe(false);
  });
});

describe("invitationExpiresAt", () => {
  it("tombe exactement à INVITATION_LIFETIME_DAYS jours", () => {
    const expected = new Date(INVITED_AT.getTime() + INVITATION_LIFETIME_DAYS * DAY_MS);

    expect(invitationExpiresAt(INVITED_AT).toISOString()).toBe(expected.toISOString());
  });

  it("ne mute pas la date qu'on lui donne", () => {
    const original = INVITED_AT.getTime();

    invitationExpiresAt(INVITED_AT);

    expect(INVITED_AT.getTime()).toBe(original);
  });
});
