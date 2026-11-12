import { versionsQuerySchema, versionsViewSchema } from "../versions.js";

describe("versionsQuerySchema", () => {
  it("n'exige pas de date quand seuls des sujets globaux sont demandés", () => {
    const parsed = versionsQuerySchema.parse({ subjects: "companies,orders-all" });
    expect(parsed).toEqual({ subjects: ["companies", "orders-all"] });
  });

  it("exige la date dès qu'un sujet journalier est demandé, et le nomme", () => {
    const parsed = versionsQuerySchema.safeParse({ subjects: "companies,orders" });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toContain("« orders »");
  });

  it("mêle sujets journaliers et globaux sous une date", () => {
    const parsed = versionsQuerySchema.parse({
      date: "2026-10-03",
      subjects: "orders, companies,orders",
    });
    expect(parsed).toEqual({ date: "2026-10-03", subjects: ["orders", "companies"] });
  });

  it("refuse une date mal formée", () => {
    expect(versionsQuerySchema.safeParse({ date: "03/10/2026", subjects: "orders" }).success).toBe(
      false,
    );
  });

  it("refuse un sujet inconnu en le nommant", () => {
    const parsed = versionsQuerySchema.safeParse({ subjects: "companies,stock" });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toContain("« stock »");
  });

  it("refuse une liste absente", () => {
    expect(versionsQuerySchema.safeParse({ date: "2026-10-03" }).success).toBe(false);
  });
});

describe("versionsViewSchema", () => {
  it("accepte une réponse sans date et partielle", () => {
    expect(versionsViewSchema.parse({ date: null, versions: { companies: 4 } })).toEqual({
      date: null,
      versions: { companies: 4 },
    });
  });

  it("refuse un sujet inconnu ou un numéro négatif", () => {
    expect(versionsViewSchema.safeParse({ date: null, versions: { stock: 1 } }).success).toBe(
      false,
    );
    expect(versionsViewSchema.safeParse({ date: null, versions: { companies: -1 } }).success).toBe(
      false,
    );
  });
});
