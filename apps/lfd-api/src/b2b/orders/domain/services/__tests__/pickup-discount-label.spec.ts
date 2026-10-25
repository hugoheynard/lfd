import {
  adjustmentRuleLabel,
  pickupDiscountLabel,
  pickupSiteOf,
} from "../pickup-discount-label.js";

const ADDRESS = {
  label: "Le Labo",
  ligne1: "route de la Balme",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "FR",
};

describe("pickupDiscountLabel", () => {
  it("un pourcentage : « Remise retrait Le Labo (5 %) »", () => {
    expect(
      pickupDiscountLabel({
        adjustment: { mode: "percent", bp: 500 },
        site: "Le Labo",
        eligibleCents: null,
      }),
    ).toBe("Remise retrait Le Labo (5 %)");
  });

  it("un montant fixe : « Remise retrait Le Labo (2,00 €) »", () => {
    expect(
      pickupDiscountLabel({
        adjustment: { mode: "amount", cents: 200 },
        site: "Le Labo",
        eligibleCents: null,
      }),
    ).toBe("Remise retrait Le Labo (2,00 €)");
  });

  it("une ligne exclue : « … sur X € éligibles » après la règle", () => {
    expect(
      pickupDiscountLabel({
        adjustment: { mode: "percent", bp: 500 },
        site: "Le Labo",
        eligibleCents: 10_550,
      }),
    ).toBe("Remise retrait Le Labo (5 %) sur 105,50 € éligibles");
  });

  it("un point inconnu : « Remise retrait (5 %) »", () => {
    expect(
      pickupDiscountLabel({
        adjustment: { mode: "percent", bp: 500 },
        site: null,
        eligibleCents: null,
      }),
    ).toBe("Remise retrait (5 %)");
  });

  it("sans ajustement figé (commande ancienne) : aucune règle inventée", () => {
    expect(pickupDiscountLabel({ adjustment: null, site: null, eligibleCents: null })).toBe(
      "Remise retrait",
    );
    expect(pickupDiscountLabel({ adjustment: null, site: "Le Labo", eligibleCents: null })).toBe(
      "Remise retrait Le Labo",
    );
  });
});

describe("adjustmentRuleLabel", () => {
  it("écrit les points de base en pourcentage, sans zéro inutile", () => {
    expect(adjustmentRuleLabel({ mode: "percent", bp: 500 })).toBe("5 %");
    expect(adjustmentRuleLabel({ mode: "percent", bp: 250 })).toBe("2,5 %");
    expect(adjustmentRuleLabel({ mode: "percent", bp: 1_000 })).toBe("10 %");
    expect(adjustmentRuleLabel({ mode: "percent", bp: 1_234 })).toBe("12,34 %");
  });

  it("écrit un montant en euros", () => {
    expect(adjustmentRuleLabel({ mode: "amount", cents: 1_250 })).toBe("12,50 €");
  });
});

describe("pickupSiteOf", () => {
  it("préfère le point nommé, puis le libellé de l'adresse figée", () => {
    expect(pickupSiteOf({ method: "pickup", address: ADDRESS, pickupLabel: "Boutique" })).toBe(
      "Boutique",
    );
    expect(pickupSiteOf({ method: "pickup", address: ADDRESS, pickupLabel: null })).toBe("Le Labo");
  });

  it("rien en livraison, ni sans nom", () => {
    expect(pickupSiteOf({ method: "delivery", address: ADDRESS, pickupLabel: null })).toBeNull();
    expect(
      pickupSiteOf({ method: "pickup", address: { ...ADDRESS, label: " " }, pickupLabel: null }),
    ).toBeNull();
  });
});
