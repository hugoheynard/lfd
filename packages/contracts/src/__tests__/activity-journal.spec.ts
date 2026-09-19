import { activityQuerySchema, taxActivityQuerySchema } from "../activity-journal.js";

describe("activityQuerySchema — la recherche libre `q`", () => {
  it("est facultative : sans elle, la question reste celle d'hier", () => {
    expect(activityQuerySchema.parse({})).toEqual({ limit: 50 });
  });

  it("garde le texte cherché, débarrassé de ses espaces", () => {
    expect(activityQuerySchema.parse({ q: "  Cécile  " }).q).toBe("Cécile");
  });

  it("refuse un texte trop court une fois rogné — il ramènerait tout le journal", () => {
    expect(activityQuerySchema.safeParse({ q: "a" }).success).toBe(false);
    expect(activityQuerySchema.safeParse({ q: "  a  " }).success).toBe(false);
  });

  it("accepte 2 et 100 caractères, refuse 101", () => {
    expect(activityQuerySchema.safeParse({ q: "ab" }).success).toBe(true);
    expect(activityQuerySchema.safeParse({ q: "x".repeat(100) }).success).toBe(true);
    expect(activityQuerySchema.safeParse({ q: "x".repeat(101) }).success).toBe(false);
  });

  it("laisse passer les jokers SQL tels quels — c'est la lecture qui les neutralise", () => {
    expect(activityQuerySchema.parse({ q: "50%_\\" }).q).toBe("50%_\\");
  });
});

/** Le module de la comptabilité (Hugo, 2026-09-19) : un filtre comme les autres. */
describe("activityQuerySchema — le module `comptabilite`", () => {
  it("se filtre", () => {
    expect(activityQuerySchema.parse({ module: "comptabilite" }).module).toBe("comptabilite");
  });

  it("refuse toujours un module inconnu", () => {
    expect(activityQuerySchema.safeParse({ module: "compta" }).success).toBe(false);
  });
});

/** La tranche fiscale (lot 4 du plan du journal, 2026-09-19). */
describe("taxActivityQuerySchema — les filtres de la tranche fiscale", () => {
  it("écarte `module` : aucun paramètre ne peut élargir la tranche", () => {
    expect(taxActivityQuerySchema.parse({ module: "comptes", q: "tva" })).toEqual({
      limit: 50,
      q: "tva",
    });
  });

  it("garde les filtres qui la resserrent, et la pagination figée", () => {
    const query = taxActivityQuerySchema.parse({
      subjectId: "vat_1",
      actorId: "staff_1",
      page: "2",
      asOf: "01K00000000000000000000009",
      limit: "20",
    });

    expect(query).toEqual({
      subjectId: "vat_1",
      actorId: "staff_1",
      page: 2,
      asOf: "01K00000000000000000000009",
      limit: 20,
    });
  });

  it("refuse `page` et `before` ensemble, comme le journal", () => {
    const parsed = taxActivityQuerySchema.safeParse({
      page: "2",
      before: "01K00000000000000000000000",
    });

    expect(parsed.success).toBe(false);
  });
});
