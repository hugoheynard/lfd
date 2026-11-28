import {
  planVersionDossierResendPayloadSchema,
  planVersionParamSchema,
  planVersionRangeQuerySchema,
} from "../production-plan-versions.js";

/** La forme de `?from=&to=` sur la comparaison des versions du plan. */
describe("planVersionRangeQuerySchema", () => {
  it("lit deux numéros de version depuis l'URL", () => {
    expect(planVersionRangeQuerySchema.parse({ from: "1", to: "3" })).toEqual({ from: 1, to: 3 });
  });

  it("laisse passer une plage inversée : c'est le noyau qui la refuse, en la nommant", () => {
    expect(planVersionRangeQuerySchema.parse({ from: "3", to: "1" })).toEqual({ from: 3, to: 1 });
  });

  it.each([
    ["absent", {}],
    ["un seul bord", { from: "1" }],
    ["pas un nombre", { from: "un", to: "2" }],
    ["décimal", { from: "1.5", to: "2" }],
    ["zéro", { from: "0", to: "2" }],
    ["négatif", { from: "-1", to: "2" }],
  ])("refuse une plage mal formée (%s)", (_case, raw) => {
    expect(planVersionRangeQuerySchema.safeParse(raw).success).toBe(false);
  });
});

/** Le corps du renvoi du dossier (lot H6) : une ligne, ou tous les dépassés. */
describe("planVersionDossierResendPayloadSchema", () => {
  it("lit une ligne visée, ou « tous les dépassés »", () => {
    expect(
      planVersionDossierResendPayloadSchema.parse({ target: "recipient", recipientId: " r-1 " }),
    ).toEqual({ target: "recipient", recipientId: "r-1" });
    expect(planVersionDossierResendPayloadSchema.parse({ target: "outdated" })).toEqual({
      target: "outdated",
    });
  });

  it.each([
    ["sans cible", {}],
    ["cible inconnue", { target: "all" }],
    ["ligne sans identifiant", { target: "recipient" }],
    ["identifiant vide", { target: "recipient", recipientId: "  " }],
  ])("refuse un corps mal formé (%s)", (_case, raw) => {
    expect(planVersionDossierResendPayloadSchema.safeParse(raw).success).toBe(false);
  });
});

describe("planVersionParamSchema", () => {
  it("lit un numéro de version dans le chemin, et refuse ce qui n'en est pas un", () => {
    expect(planVersionParamSchema.parse("2")).toBe(2);
    expect(planVersionParamSchema.safeParse("0").success).toBe(false);
    expect(planVersionParamSchema.safeParse("v2").success).toBe(false);
  });
});
