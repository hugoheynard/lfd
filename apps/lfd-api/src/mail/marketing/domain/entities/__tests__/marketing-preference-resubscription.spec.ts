import { MarketingResubscriptionRefusedError } from "../../errors/marketing-preference.errors.js";
import { MarketingAddress } from "../../value-objects/marketing-address.js";
import type { ConsentDraft } from "../marketing-preference.js";
import { MarketingPreference } from "../marketing-preference.js";

/**
 * La réinscription par « Mes préférences » (C3) et le déménagement d'adresse
 * (C2, règle 24) — l'agrégat seul. Les dates ne sont comparées qu'entre elles.
 */

const ADDRESS = MarketingAddress.of("colette@halles.fr", "a".repeat(64));
const NEXT = MarketingAddress.of("colette@neuve.fr", "b".repeat(64));
const T0 = new Date(Date.UTC(2026, 0, 1, 8));
const T1 = new Date(Date.UTC(2026, 0, 2, 8));
const T2 = new Date(Date.UTC(2026, 0, 3, 8));

function draft(place: ConsentDraft["proof"]["place"], at: Date = T1): ConsentDraft {
  return {
    proof: { textVersion: "society.v1", locale: "fr", place, ref: "u_1" },
    origin: "direct",
    at,
  };
}

function unsubscribed(): MarketingPreference {
  return MarketingPreference.optedOut("p1", "lfc", ADDRESS, { at: T0, source: "link" });
}

describe("MarketingPreference.resubscribe — le seul geste qui lève un « non »", () => {
  it("adresse vérifiée : `accepted` d'emblée, la désinscription effacée", () => {
    const row = unsubscribed();
    row.resubscribe(draft("preferences"), true);
    expect(row.snapshot()).toMatchObject({
      status: "accepted",
      confirmedAt: T1,
      unsubscribedAt: null,
      unsubscribedSource: null,
      proof: { place: "preferences" },
    });
    expect(row.awaitsResubscription()).toBe(false);
  });

  it("adresse NON vérifiée : `pending`, et la désinscription reste jusqu'au clic", () => {
    const row = unsubscribed();
    row.resubscribe(draft("preferences"), false);
    expect(row.snapshot()).toMatchObject({
      status: "pending",
      requestedAt: T1,
      confirmedAt: null,
      unsubscribedAt: T0,
      unsubscribedSource: "link",
    });
    expect(row.awaitsResubscription()).toBe(true);
    expect(row.allowsMarketing()).toBe(false);
  });

  it("le clic du lien confirme la réinscription et efface la désinscription", () => {
    const row = unsubscribed();
    row.resubscribe(draft("preferences"), false);
    expect(row.confirmIssued(T1, T2)).toBe(true);
    expect(row.snapshot()).toMatchObject({
      status: "accepted",
      confirmedAt: T2,
      unsubscribedAt: null,
      unsubscribedSource: null,
    });
  });

  it.each(["order", "signup", "newsletter"] as const)(
    "refuse une réinscription venue de « %s », vérifiée ou non",
    (place) => {
      expect(() => unsubscribed().resubscribe(draft(place), true)).toThrow(
        MarketingResubscriptionRefusedError,
      );
      expect(() => unsubscribed().resubscribe(draft(place), false)).toThrow(
        MarketingResubscriptionRefusedError,
      );
    },
  );

  it("une demande ordinaire en attente n'est pas une réinscription", () => {
    const row = MarketingPreference.requested("p1", "lfc", ADDRESS, draft("order"));
    expect(row.awaitsResubscription()).toBe(false);
    expect(row.unsubscribeAct).toBeNull();
  });
});

describe("MarketingPreference.relocate — l'état suit l'adresse (règle 24)", () => {
  it("un accord passe à la nouvelle adresse, état et preuve compris", () => {
    const row = MarketingPreference.accepted("p1", "lfc", ADDRESS, draft("signup", T0));
    row.relocate(NEXT);
    expect(row.snapshot()).toMatchObject({
      id: "p1",
      recipientKey: "colette@neuve.fr",
      print: "b".repeat(64),
      status: "accepted",
      proof: { place: "signup" },
    });
  });

  it("une désinscription rend son acte, à recopier sur une autre adresse", () => {
    expect(unsubscribed().unsubscribeAct).toEqual({ at: T0, source: "link" });
  });
});
