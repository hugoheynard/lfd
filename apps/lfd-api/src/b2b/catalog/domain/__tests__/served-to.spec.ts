import { catalogAudienceOf, servedTo, servedToAnyone, type ServableItem } from "../served-to.js";

/**
 * `servedTo` (2a5) : l'audience de l'article contient le lecteur ET la
 * plateforme ne l'a pas masqué pour lui. Le masquage ne fait que retirer.
 */

function item(over: Partial<ServableItem> = {}): ServableItem {
  return {
    audience: null,
    isHidden: false,
    isHiddenPublic: false,
    publicReviewPending: false,
    proReviewPending: false,
    isReserved: false,
    isMadeToOrder: false,
    ...over,
  };
}

describe("servedTo", () => {
  it("lit une audience absente comme `both` : rien ne change pour l'existant", () => {
    expect(servedTo(item(), "pro")).toBe(true);
    expect(servedTo(item(), "public")).toBe(true);
  });

  it.each([
    ["pro", "pro", true],
    ["pro", "public", false],
    ["public", "pro", false],
    ["public", "public", true],
    ["both", "pro", true],
    ["both", "public", true],
  ] as const)("article %s, lecteur %s → %s", (audience, viewer, expected) => {
    expect(servedTo(item({ audience }), viewer)).toBe(expected);
  });

  it("masque pour une audience sans toucher à l'autre", () => {
    expect(servedTo(item({ isHidden: true }), "pro")).toBe(false);
    expect(servedTo(item({ isHidden: true }), "public")).toBe(true);
    expect(servedTo(item({ isHiddenPublic: true }), "public")).toBe(false);
    expect(servedTo(item({ isHiddenPublic: true }), "pro")).toBe(true);
  });

  /** H5 : démasquer ne peut pas montrer aux pros un article que le référentiel dit `public`. */
  it("ne laisse pas le masquage élargir l'audience", () => {
    expect(servedTo(item({ audience: "public", isHidden: false }), "pro")).toBe(false);
  });

  /** Lot 3 : un article neuf attend d'être validé avant la boutique publique. */
  it("refuse le public tant que l'article attend sa validation, et le sert aux pros validés", () => {
    const pending = item({ audience: "both", publicReviewPending: true });
    expect(servedTo(pending, "public")).toBe(false);
    expect(servedTo(pending, "pro")).toBe(true);
    expect(servedToAnyone(item({ audience: "public", publicReviewPending: true }))).toBe(false);
  });

  /** Hugo, 2026-10-15, option 2 : les pros aussi attendent la validation. */
  it("refuse les pros tant que l'article attend leur validation, sans toucher au public", () => {
    const pending = item({ audience: "both", proReviewPending: true });
    expect(servedTo(pending, "pro")).toBe(false);
    expect(servedTo(pending, "public")).toBe(true);
  });

  it("dit servi à quelqu'un si l'une des deux boutiques le sert", () => {
    expect(servedToAnyone(item({ audience: "pro", isHidden: true }))).toBe(false);
    expect(servedToAnyone(item({ audience: "both", isHidden: true }))).toBe(true);
  });
});

describe("catalogAudienceOf", () => {
  it("relit les trois valeurs, et lit `null` ce qu'il ne connaît pas", () => {
    expect(catalogAudienceOf("pro")).toBe("pro");
    expect(catalogAudienceOf("public")).toBe("public");
    expect(catalogAudienceOf("both")).toBe("both");
    expect(catalogAudienceOf(null)).toBeNull();
    expect(catalogAudienceOf("tous")).toBeNull();
  });
});

/**
 * S3 de `plan-articles-sur-mesure.md` : un article réservé ou sur mesure n'est
 * JAMAIS servi au public, quelle que soit son audience — et `servedToAnyone`,
 * que lisent la vitrine et les ventes d'opération, ne dit plus « oui » par sa
 * branche pro pour lui.
 */
describe("S3 — réservé ou sur mesure, jamais au public", () => {
  it.each([
    ["réservé", { isReserved: true }],
    ["sur mesure", { isMadeToOrder: true }],
  ])("%s : refusé au public, servi aux pros", (_label, over) => {
    expect(servedTo(item({ audience: "both", ...over }), "public")).toBe(false);
    expect(servedTo(item({ audience: "public", ...over }), "public")).toBe(false);
    expect(servedTo(item({ audience: "both", ...over }), "pro")).toBe(true);
  });

  it.each([
    ["réservé", { isReserved: true }],
    ["sur mesure", { isMadeToOrder: true }],
  ])("%s : `servedToAnyone` dit non, même servi aux pros", (_label, over) => {
    expect(servedToAnyone(item({ audience: "both", ...over }))).toBe(false);
    expect(servedToAnyone(item({ audience: "pro", ...over }))).toBe(false);
  });

  it("un article ouvert reste servi à quelqu'un par sa branche pro", () => {
    expect(servedToAnyone(item({ audience: "pro" }))).toBe(true);
  });
});
