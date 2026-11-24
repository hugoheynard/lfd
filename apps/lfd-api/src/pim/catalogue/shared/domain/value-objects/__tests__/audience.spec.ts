import { InvalidAudienceError } from "../../errors/audience-errors.js";
import { audience, effectiveAudience, servedAudiences } from "../audience.js";

describe("Audience — à qui l'on vend", () => {
  it.each(["pro", "public", "both", "resupply"])("accepte « %s »", (raw) => {
    expect(audience(raw)).toBe(raw);
  });

  it.each(["", "PRO", "tous", "b2b"])("refuse « %s » en nommant les quatre choix", (raw) => {
    expect(() => audience(raw)).toThrow(InvalidAudienceError);
    expect(() => audience(raw)).toThrow(/pro.*public.*both.*resupply/);
  });
});

describe("effectiveAudience — la fiche d'abord, la famille ensuite", () => {
  it("rend celle de la famille quand la fiche hérite", () => {
    expect(effectiveAudience(null, "pro")).toBe("pro");
  });

  it("rend celle de la fiche quand elle déroge, même plus large", () => {
    expect(effectiveAudience("both", "pro")).toBe("both");
  });

  it("rend celle de la fiche quand elle déroge, plus étroite", () => {
    expect(effectiveAudience("public", "both")).toBe("public");
  });
});

describe("servedAudiences — `both` sert deux clientèles", () => {
  it("déplie `both`", () => {
    expect(servedAudiences("both")).toEqual(["pro", "public"]);
  });

  it("ne sert aucune clientèle au réassort seul : aucun prix n'y est exigé", () => {
    expect(servedAudiences("resupply")).toEqual([]);
  });

  it("laisse une clientèle seule telle quelle", () => {
    expect(servedAudiences("pro")).toEqual(["pro"]);
  });
});
