import { floorClienteleQuerySchema, setPriceFloorPayloadSchema } from "../pricing.js";

/**
 * **La clientèle entre dans le contrat avec `pro` par défaut**
 * (`documentation/comptabilite/plan-limites-de-prix.md` §5) : le front en ligne,
 * qui n'envoie rien, doit continuer de viser la limite pro.
 */
describe("la clientèle d'une limite, sur le fil", () => {
  const scope = { type: "global", id: null } as const;

  it("vise le pro quand la charge ne dit rien", () => {
    const parsed = setPriceFloorPayloadSchema.parse({ scope, mode: "percent", value: 6_000 });

    expect(parsed.clientele).toBe("pro");
  });

  it("vise le public quand la charge le dit", () => {
    const parsed = setPriceFloorPayloadSchema.parse({
      scope,
      mode: "percent",
      value: 6_000,
      clientele: "public",
    });

    expect(parsed.clientele).toBe("public");
  });

  it("vise le pro sans `?clientele=`, et refuse une clientèle inconnue", () => {
    expect(floorClienteleQuerySchema.parse({}).clientele).toBe("pro");
    expect(floorClienteleQuerySchema.parse({ clientele: "public" }).clientele).toBe("public");
    expect(floorClienteleQuerySchema.safeParse({ clientele: "b2c" }).success).toBe(false);
  });
});
