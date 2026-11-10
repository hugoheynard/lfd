import { engagementBlockOf, engagementRefusalOf } from "../order-cancellation-account.js";

/**
 * Les refus d'annuler une commande au compte (doc
 * `documentation/commandes/annulation/annulation-par-le-staff.md`, C5.2, C5.6) : purs, sans horloge.
 * Les jours ne sont comparés qu'à leur propre mise en forme.
 */

describe("engagementBlockOf — l'engagement comptable en refus", () => {
  it("rien d'engagé : pas de refus", () => {
    expect(engagementBlockOf({ kind: "free" })).toBeNull();
  });

  it("`null` au compte : `engagement_unknown`, jamais « annulable » (S6)", () => {
    expect(engagementBlockOf(null)).toEqual({ kind: "engagement_unknown" });
  });

  it.each([
    { kind: "invoiced", invoiceNumber: "FA-LFD-2026-000001", issuedOn: "2026-09-30" },
    { kind: "collecting", state: "batched", collectionDay: null, statementNumber: null },
    { kind: "collected", state: "returned", collectionDay: "2026-10-05" },
    { kind: "written_off" },
    { kind: "returned_before" },
    { kind: "settled_otherwise" },
  ] as const)("$kind : refusé tel quel", (engagement) => {
    expect(engagementBlockOf(engagement)).toEqual(engagement);
  });
});

describe("engagementRefusalOf — les phrases (C5.6)", () => {
  it("facturée : la date et le numéro, et le geste de sortie (l'avoir)", () => {
    expect(
      engagementRefusalOf({
        kind: "invoiced",
        invoiceNumber: "FA-LFD-2026-000012",
        issuedOn: "2026-09-30",
      }),
    ).toBe(
      "Cette commande a été facturée le 30/09/2026 (facture n° FA-LFD-2026-000012). Une facture émise ne s'efface pas : il faut un avoir, que l'équipe ne peut pas encore émettre ici. Voyez avec la comptabilité.",
    );
  });

  it("dans un lot : l'échéance et le relevé quand on les a", () => {
    expect(
      engagementRefusalOf({
        kind: "collecting",
        state: "batched",
        collectionDay: "2026-10-20",
        statementNumber: "01ARRETE",
      }),
    ).toBe(
      "Cette commande est dans le lot de prélèvement du 20/10/2026 (relevé n° 01ARRETE). Annulez d'abord ce lot depuis la comptabilité s'il n'est pas déposé, puis revenez ici.",
    );
  });

  it("dans un lot sans échéance ni relevé : sans date, jamais inventée", () => {
    expect(
      engagementRefusalOf({
        kind: "collecting",
        state: "batched",
        collectionDay: null,
        statementNumber: null,
      }),
    ).toBe(
      "Cette commande est dans le lot de prélèvement. Annulez d'abord ce lot depuis la comptabilité s'il n'est pas déposé, puis revenez ici.",
    );
  });

  it("prélevée : le lot daté, ou sans date", () => {
    expect(
      engagementRefusalOf({ kind: "collected", state: "collected", collectionDay: "2026-10-05" }),
    ).toContain("déjà été prélevée (lot du 05/10/2026).");
    expect(
      engagementRefusalOf({ kind: "collected", state: "returned", collectionDay: null }),
    ).toContain("déjà été prélevée. L'annulation avec remboursement");
  });

  it.each([
    ["written_off", "passée en perte après un rejet de prélèvement"],
    ["returned_before", "rejeté par la banque puis représenté"],
    ["settled_otherwise", "réglée hors prélèvement"],
    ["engagement_unknown", "n'a pas pu être lu : rien n'a été annulé"],
  ] as const)("%s : nomme le cas", (kind, words) => {
    expect(engagementRefusalOf({ kind })).toContain(words);
  });
});
