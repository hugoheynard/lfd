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
