import { dayVersionsQuerySchema, dayVersionsViewSchema } from "../day-version.js";

describe("dayVersionsQuerySchema", () => {
  it("exige une date AAAA-MM-JJ : un veilleur sait toujours quelle journée il regarde", () => {
    expect(
      dayVersionsQuerySchema.safeParse({ date: "2026-10-03", journals: "orders" }).success,
    ).toBe(true);
    expect(
      dayVersionsQuerySchema.safeParse({ date: "03/10/2026", journals: "orders" }).success,
    ).toBe(false);
    expect(dayVersionsQuerySchema.safeParse({ journals: "orders" }).success).toBe(false);
  });

  it("lit la liste séparée par des virgules, sans doublon", () => {
    const parsed = dayVersionsQuerySchema.parse({
      date: "2026-10-03",
      journals: "orders, production,orders",
    });
    expect(parsed.journals).toEqual(["orders", "production"]);
  });

  it("refuse un journal inconnu en le nommant", () => {
    const parsed = dayVersionsQuerySchema.safeParse({
      date: "2026-10-03",
      journals: "orders,stock",
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toContain("« stock »");
  });

  it("refuse une liste absente ou vide", () => {
    expect(dayVersionsQuerySchema.safeParse({ date: "2026-10-03" }).success).toBe(false);
    expect(dayVersionsQuerySchema.safeParse({ date: "2026-10-03", journals: "" }).success).toBe(
      false,
    );
  });
});

describe("dayVersionsViewSchema", () => {
  it("accepte la version zéro et un journal absent, refuse une version négative", () => {
    expect(
      dayVersionsViewSchema.safeParse({ date: "2026-10-03", versions: { orders: 0 } }).success,
    ).toBe(true);
    expect(
      dayVersionsViewSchema.safeParse({ date: "2026-10-03", versions: { orders: -1 } }).success,
    ).toBe(false);
  });
});
