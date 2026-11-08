import {
  InvalidMarketingPreferenceError,
  MarketingConfirmationAfterUnsubscribeError,
  MarketingResubscriptionRefusedError,
} from "../../errors/marketing-preference.errors.js";
import { MarketingAddress } from "../../value-objects/marketing-address.js";
import type { ConsentDraft, MarketingPreferenceSnapshot } from "../marketing-preference.js";
import { MarketingPreference } from "../marketing-preference.js";

const PRINT = "a".repeat(64);
const ADDRESS = MarketingAddress.of("colette@halles.fr", PRINT);
const T0 = new Date(Date.UTC(2026, 0, 1, 8));
const T1 = new Date(Date.UTC(2026, 0, 2, 8));

function draft(place: ConsentDraft["proof"]["place"]): ConsentDraft {
  return {
    proof: { textVersion: "lfc-1", locale: "fr", place, ref: "ord_1" },
    origin: "direct",
    at: T0,
  };
}

describe("MarketingPreference — les transitions du registre (U2)", () => {
  it("une adresse inconnue désinscrite y entre désinscrite, avec son instant et sa source", () => {
    const row = MarketingPreference.optedOut("p1", "lfc", ADDRESS, { at: T0, source: "link" });
    expect(row.snapshot()).toMatchObject({
      status: "unsubscribed",
      recipientKey: "colette@halles.fr",
      print: PRINT,
      origin: null,
      proof: null,
      unsubscribedAt: T0,
      unsubscribedSource: "link",
    });
    expect(row.allowsMarketing()).toBe(false);
  });

  it("pending → accepted au clic de confirmation ; un second clic ne change rien", () => {
    const row = MarketingPreference.requested("p1", "lfc", ADDRESS, draft("order"));
    expect(row.allowsMarketing()).toBe(false);
    row.confirm(T1);
    row.confirm(new Date(Date.UTC(2026, 0, 3)));
    expect(row.snapshot()).toMatchObject({ status: "accepted", confirmedAt: T1, requestedAt: T0 });
    expect(row.allowsMarketing()).toBe(true);
  });

  it("une adresse vérifiée est acceptée d'emblée, la preuve rangée", () => {
    const row = MarketingPreference.accepted("p1", "lfc", ADDRESS, draft("signup"));
    expect(row.snapshot()).toMatchObject({
      status: "accepted",
      origin: "direct",
      proof: { textVersion: "lfc-1", locale: "fr", place: "signup", ref: "ord_1" },
      confirmedAt: T0,
    });
  });

  it("toute ligne se désinscrit, une seule fois : le premier instant reste", () => {
    const row = MarketingPreference.accepted("p1", "lfc", ADDRESS, draft("signup"));
    expect(row.unsubscribe({ at: T1, source: "one_click" })).toBe(true);
    expect(row.unsubscribe({ at: new Date(Date.UTC(2026, 0, 5)), source: "link" })).toBe(false);
    expect(row.snapshot()).toMatchObject({
      status: "unsubscribed",
      unsubscribedAt: T1,
      unsubscribedSource: "one_click",
    });
  });

  it("une confirmation arrivée après une désinscription est refusée", () => {
    const row = MarketingPreference.requested("p1", "lfc", ADDRESS, draft("order"));
    row.unsubscribe({ at: T1, source: "link" });
    expect(() => row.confirm(T1)).toThrow(MarketingConfirmationAfterUnsubscribeError);
  });

  it.each(["signup", "order", "newsletter", "staff"] as const)(
    "une désinscription ne se lève pas par « %s »",
    (place) => {
      const row = MarketingPreference.optedOut("p1", "lfc", ADDRESS, { at: T0, source: "link" });
      expect(() => row.resubscribe(draft(place), true)).toThrow(
        MarketingResubscriptionRefusedError,
      );
      expect(row.isUnsubscribed()).toBe(true);
    },
  );

  it("« Mes préférences », connecté, réinscrit — la désinscription s'efface", () => {
    const row = MarketingPreference.optedOut("p1", "lfc", ADDRESS, { at: T0, source: "link" });
    row.resubscribe({ ...draft("preferences"), at: T1 }, true);
    expect(row.snapshot()).toMatchObject({
      status: "accepted",
      confirmedAt: T1,
      unsubscribedAt: null,
      unsubscribedSource: null,
    });
  });
});

describe("MarketingPreference — l'effacement (règle 23)", () => {
  it("un accord part entièrement", () => {
    expect(MarketingPreference.accepted("p1", "lfc", ADDRESS, draft("signup")).erase()).toBe(
      "forget",
    );
    expect(MarketingPreference.requested("p1", "lfc", ADDRESS, draft("order")).erase()).toBe(
      "forget",
    );
  });

  it("une désinscription perd sa clé en clair et garde son empreinte", () => {
    const row = MarketingPreference.optedOut("p1", "lfc", ADDRESS, { at: T0, source: "link" });
    expect(row.erase()).toBe("print-kept");
    expect(row.snapshot()).toMatchObject({
      recipientKey: null,
      print: PRINT,
      status: "unsubscribed",
    });
    expect(row.isUnsubscribed()).toBe(true);
  });
});

describe("MarketingPreference.rehydrate — la cohérence d'une ligne relue", () => {
  const base: MarketingPreferenceSnapshot = MarketingPreference.optedOut("p1", "lfc", ADDRESS, {
    at: T0,
    source: "link",
  }).snapshot();

  it("refuse une clé effacée hors d'une désinscription", () => {
    expect(() =>
      MarketingPreference.rehydrate({ ...base, recipientKey: null, status: "pending" }),
    ).toThrow(InvalidMarketingPreferenceError);
  });

  it("refuse une désinscription sans source", () => {
    expect(() => MarketingPreference.rehydrate({ ...base, unsubscribedSource: null })).toThrow(
      InvalidMarketingPreferenceError,
    );
  });

  it("refuse un accord sans confirmation", () => {
    expect(() =>
      MarketingPreference.rehydrate({ ...base, status: "accepted", confirmedAt: null }),
    ).toThrow(InvalidMarketingPreferenceError);
  });

  it("relit une désinscription effacée", () => {
    expect(MarketingPreference.rehydrate({ ...base, recipientKey: null }).isUnsubscribed()).toBe(
      true,
    );
  });
});
