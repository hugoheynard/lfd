import type { OrderPayerStanding } from "../../ports/order-payer.reader.js";
import { orderPrincipalOf } from "../order-principal.js";

function standing(over: Partial<OrderPayerStanding> = {}): OrderPayerStanding {
  return {
    companyId: "chalet",
    companyName: "Chalet Edelweiss",
    groupWithoutDelivery: false,
    billingFollow: null,
    principalId: "alpes",
    followsPricing: false,
    ...over,
  };
}

const BILLING = {
  payerId: "alpes",
  payerName: "Alpes Chalets Privés",
  payerStatus: "active",
} as const;

describe("orderPrincipalOf — le principal copié à la passation (avis au principal, §2, Q1)", () => {
  it("n'a pas de principal pour une commande sans société", () => {
    expect(orderPrincipalOf(null)).toBeNull();
  });

  it("n'a pas de principal pour une société qui n'est rattachée à rien", () => {
    expect(orderPrincipalOf(standing({ principalId: null }))).toBeNull();
  });

  it("montre le montant au principal quand le site suit `billing`", () => {
    expect(orderPrincipalOf(standing({ billingFollow: BILLING }))).toEqual({
      companyId: "alpes",
      seesAmount: true,
    });
  });

  it("montre le montant au principal quand le site suit `pricing`", () => {
    expect(orderPrincipalOf(standing({ followsPricing: true }))?.seesAmount).toBe(true);
  });

  it("copie le principal SANS le montant quand le site ne suit ni l'un ni l'autre", () => {
    expect(orderPrincipalOf(standing())).toEqual({ companyId: "alpes", seesAmount: false });
  });
});
