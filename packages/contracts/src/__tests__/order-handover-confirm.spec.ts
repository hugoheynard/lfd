import { confirmHandoverPayloadSchema, HANDOVER_RANKS_MAX } from "../order-handover-confirm.js";

describe("contrat du retrait par envoi (plan E7 reliquat, L4c)", () => {
  it("accepte un corps vide — l'écran à un seul envoi n'envoie rien de plus", () => {
    expect(confirmHandoverPayloadSchema.parse({})).toEqual({});
  });

  it("accepte l'absence de corps — les appelants d'avant L4c n'en envoyaient pas", () => {
    expect(confirmHandoverPayloadSchema.parse(undefined)).toEqual({});
  });

  it("accepte les rangs cochés", () => {
    expect(confirmHandoverPayloadSchema.parse({ ranks: [1, 2] })).toEqual({ ranks: [1, 2] });
  });

  it("refuse une liste vide, un rang nul ou fractionnaire, un rang coché deux fois", () => {
    for (const ranks of [[], [0], [1.5], [2, 2]]) {
      expect(confirmHandoverPayloadSchema.safeParse({ ranks }).success).toBe(false);
    }
  });

  it("refuse plus de rangs qu'un comptoir n'en tend", () => {
    const ranks = Array.from({ length: HANDOVER_RANKS_MAX + 1 }, (_, index) => index + 1);
    expect(confirmHandoverPayloadSchema.safeParse({ ranks }).success).toBe(false);
  });
});
