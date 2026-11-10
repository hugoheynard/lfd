import { InvalidPayloadError } from "../../../../platform/shared/http/zod-body.pipe.js";
import { skuParam } from "../resupply-params.js";

/** Régression : le `:sku` du chemin atteignait le domaine sans validation (audit 2026-11-02). */
describe("skuParam", () => {
  it("rend l'article rogné", () => {
    expect(skuParam().transform(" CRO ")).toBe("CRO");
  });

  it("refuse un article vide en 400 qui nomme le paramètre", () => {
    expect(() => skuParam().transform("   ")).toThrow(InvalidPayloadError);
    expect(() => skuParam().transform("   ")).toThrow(/sku/u);
  });
});
