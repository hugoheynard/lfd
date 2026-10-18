import { audiencesQuerySchema } from "../audiences.js";

/** La forme seule : les segments et le seuil se calculent dans le commerce. */
describe("audiencesQuerySchema", () => {
  const parse = (query: unknown) => audiencesQuerySchema.safeParse(query);

  it("admet 7, 30 et 90 jours, une coupe connue, et l'absence des deux", () => {
    expect(parse({ days: "7" })).toMatchObject({ success: true, data: { days: 7 } });
    expect(parse({ days: "90", dimension: "moment" })).toMatchObject({
      success: true,
      data: { days: 90, dimension: "moment" },
    });
    expect(parse({})).toMatchObject({ success: true, data: {} });
  });

  it("refuse une autre période, une coupe inconnue et un champ inconnu", () => {
    expect(parse({ days: "14" }).success).toBe(false);
    expect(parse({ dimension: "age" }).success).toBe(false);
    expect(parse({ days: "30", clientId: "u1" }).success).toBe(false);
  });
});
