import {
  daySupervisionQuerySchema,
  daySupervisionViewSchema,
  lateOrderSchema,
} from "../day-supervision.js";

describe("daySupervisionQuerySchema", () => {
  it("refuse une date qui n'est pas AAAA-MM-JJ", () => {
    expect(daySupervisionQuerySchema.safeParse({ date: "2026-10-03" }).success).toBe(true);
    expect(daySupervisionQuerySchema.safeParse({ date: "03/10/2026" }).success).toBe(false);
  });

  it("accepte l'absence de date : le serveur prend alors le jour de son horloge", () => {
    expect(daySupervisionQuerySchema.safeParse({}).success).toBe(true);
  });
});

describe("lateOrderSchema", () => {
  it("ne laisse passer ni montant ni contact — une vue de supervision", () => {
    const parsed = lateOrderSchema.parse({
      orderId: "o1",
      reference: "CMD-0001",
      customerName: "Boulangerie du Col",
      fulfillmentMethod: "pickup",
      window: { start: "07:00", end: "08:00", source: "override" },
      stage: "ready",
      rule: "not_handed_over_after_window",
      totalCents: 1200,
      email: "patron@col.fr",
    });

    expect(Object.keys(parsed).sort()).toEqual([
      "customerName",
      "fulfillmentMethod",
      "orderId",
      "reference",
      "rule",
      "stage",
      // La marque « sur stock » (lot L6) : ni un montant, ni un contact.
      "supply",
      "window",
    ]);
  });
});

describe("daySupervisionViewSchema", () => {
  it("refuse un compte négatif", () => {
    const result = daySupervisionViewSchema.safeParse({
      date: "2026-10-03",
      asOf: "2026-10-03T06:00:00.000Z",
      flow: [],
      late: [],
      undated: -1,
    });
    expect(result.success).toBe(false);
  });
});

describe("lateOrderSchema — la marque « sur stock » (lot L6)", () => {
  const LATE = {
    orderId: "o1",
    reference: "CMD-0001",
    customerName: null,
    fulfillmentMethod: "pickup",
    window: { start: "07:00", end: "08:00", source: "override" },
    stage: "ready",
    rule: "not_handed_over_after_window",
  } as const;

  it("lit `planned` d'un serveur d'avant le champ", () => {
    expect(lateOrderSchema.parse(LATE).supply).toBe("planned");
  });

  it("garde `shelf`, et refuse une marque inconnue", () => {
    expect(lateOrderSchema.parse({ ...LATE, supply: "shelf" }).supply).toBe("shelf");
    expect(() => lateOrderSchema.parse({ ...LATE, supply: "vitrine" })).toThrow();
  });
});
