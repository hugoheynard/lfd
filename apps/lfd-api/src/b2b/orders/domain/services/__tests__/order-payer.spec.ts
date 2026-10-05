import {
  GroupAccountOrderRefusedError,
  OrderPayerNotActiveError,
} from "../../errors/order-payer-errors.js";
import type { OrderPayerStanding } from "../../ports/order-payer.reader.js";
import { orderPayerOf } from "../order-payer.js";

function standing(over: Partial<OrderPayerStanding> = {}): OrderPayerStanding {
  return {
    companyId: "chalet",
    companyName: "Chalet Edelweiss",
    groupWithoutDelivery: false,
    billingFollow: null,
    ...over,
  };
}

const PRINCIPAL = { payerId: "alpes", payerName: "Alpes Chalets Privés" } as const;

describe("orderPayerOf — le payeur copié à la passation (plan-sous-comptes §2.3, §2.4)", () => {
  it("n'a pas de payeur pour une commande sans société", () => {
    expect(orderPayerOf(null)).toBeNull();
  });

  it("copie la société elle-même quand elle paie seule", () => {
    expect(orderPayerOf(standing())).toBe("chalet");
  });

  it("copie le principal d'un site qui suit `billing`", () => {
    const site = standing({ billingFollow: { ...PRINCIPAL, payerStatus: "active" } });
    expect(orderPayerOf(site)).toBe("alpes");
  });

  it.each(["suspended", "terminated", "pending"] as const)(
    "refuse un site dont le principal est %s, en nommant le principal (Q4)",
    (status) => {
      const site = standing({ billingFollow: { ...PRINCIPAL, payerStatus: status } });
      expect(() => orderPayerOf(site)).toThrow(OrderPayerNotActiveError);
      expect(() => orderPayerOf(site)).toThrow(/Alpes Chalets Privés/u);
    },
  );

  it("refuse une commande au nom d'un compte de groupe sans livraison", () => {
    const group = standing({
      companyId: "cimes",
      companyName: "Groupe Hôtelier des Cimes",
      groupWithoutDelivery: true,
    });
    expect(() => orderPayerOf(group)).toThrow(GroupAccountOrderRefusedError);
    expect(() => orderPayerOf(group)).toThrow(/sous-comptes/u);
  });
});
