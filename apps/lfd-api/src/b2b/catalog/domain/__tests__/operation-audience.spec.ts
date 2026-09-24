import { InvalidCatalogOperationAudienceError } from "../errors/catalog-operation-errors.js";
import { catalogOperationAudience, intersectAudiences } from "../operation-audience.js";

describe("la clientèle d'une opération reçue", () => {
  it("garde celle du référentiel quand la réception ne restreint rien", () => {
    expect(intersectAudiences("both", null)).toBe("both");
    expect(intersectAudiences("public", null)).toBe("public");
  });

  it("restreint : les deux, réduits aux professionnels", () => {
    expect(intersectAudiences("both", "pro")).toBe("pro");
    expect(intersectAudiences("both", "public")).toBe("public");
  });

  /** D7 : la réception restreint, jamais elle n'élargit. */
  it("n'élargit JAMAIS : « les deux » posé sur une opération pro reste pro", () => {
    expect(intersectAudiences("pro", "both")).toBe("pro");
  });

  /**
   * Le référentiel est passé aux particuliers après une restriction aux pros :
   * l'intersection est vide, et c'est « personne », jamais l'une des deux.
   */
  it("rend « personne » quand les deux ne se recouvrent plus", () => {
    expect(intersectAudiences("public", "pro")).toBe("none");
  });

  it("refuse une clientèle hors des trois", () => {
    expect(() => catalogOperationAudience("tous")).toThrow(InvalidCatalogOperationAudienceError);
  });
});
