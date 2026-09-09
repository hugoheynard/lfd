import { InvalidOrderLineError } from "../../errors/order-errors.js";
import { OrderLine } from "../order-line.js";

const base = {
  sku: "VIE-001",
  productName: "Croissant",
  unitPriceMillicents: 200_000,
  vatRate: 5.5,
};

describe("OrderLine", () => {
  it("calcule le total de ligne = prix unitaire × quantité", () => {
    const line = OrderLine.create({ ...base, quantity: 3 });
    expect(line.lineTotalCents).toBe(600);
    expect(line.toSnapshot()).toEqual({
      ...base,
      quantity: 3,
      lineTotalCents: 600,
      pricing: null,
      allergens: null,
    });
  });

  it("refuse une quantité nulle, négative ou non entière", () => {
    expect(() => OrderLine.create({ ...base, quantity: 0 })).toThrow(InvalidOrderLineError);
    expect(() => OrderLine.create({ ...base, quantity: -1 })).toThrow(InvalidOrderLineError);
    expect(() => OrderLine.create({ ...base, quantity: 1.5 })).toThrow(InvalidOrderLineError);
  });

  it("refuse un prix unitaire négatif", () => {
    expect(() => OrderLine.create({ ...base, unitPriceMillicents: -1, quantity: 1 })).toThrow(
      InvalidOrderLineError,
    );
  });

  /**
   * 🔴 Les allergènes se figent comme le prix, et c'était la seule chose que la
   * ligne ne figeait pas. Sans ce gel, une correction de déclaration effaçait
   * ce sous quoi la commande avait été passée — et sur réclamation, la réponse
   * était un blanc.
   */
  it("fige les allergènes qu'on lui donne, codes ET libellés", () => {
    const line = OrderLine.create({
      ...base,
      quantity: 1,
      allergens: {
        codes: ["AU"],
        labels: [{ category: "gluten", label: "gluten" }],
        incomplete: false,
      },
    });

    expect(line.toSnapshot().allergens).toEqual({
      codes: ["AU"],
      labels: [{ category: "gluten", label: "gluten" }],
      incomplete: false,
    });
  });

  /**
   * 🔴 L'absence reste une ABSENCE. Retomber sur `{ codes: [] }` affirmerait
   * « aucun allergène » sur une ligne dont personne n'a rien déclaré — et cette
   * affirmation-là partirait figée dans une commande, donc irrattrapable.
   */
  it("n'invente aucune déclaration quand on ne lui en donne pas", () => {
    expect(OrderLine.create({ ...base, quantity: 1 }).toSnapshot().allergens).toBeNull();
  });

  /** Les trois états du référentiel traversent : `[]` AFFIRME, `null` se tait. */
  it("distingue « déclaré sans allergène » de « pas de fiche »", () => {
    const declared = OrderLine.create({
      ...base,
      quantity: 1,
      allergens: { codes: [], labels: [], incomplete: false },
    });

    expect(declared.toSnapshot().allergens?.codes).toEqual([]);
    expect(OrderLine.create({ ...base, quantity: 1 }).toSnapshot().allergens).toBeNull();
  });

  /**
   * 🔴 **Régression : une remise EN EUROS plus grande que le prix tuait la
   * commande** (défaut R1, ouvert le 2026-09-06, corrigé le 2026-09-09).
   *
   * `resolvePrice` ramène à zéro un prix passé sous zéro et le CONSIGNE
   * (`clampedToZero`) — mais la trace figée ne portait pas ce champ, et
   * `assertConsistent` ne lisait que `floored`. Le dernier étage sortait donc à
   * −300 000 quand la ligne en facturait 0, et la ligne **refusait d'exister** :
   * un 500 sur le chemin qui encaisse, pour une remise qu'un commercial a le
   * droit de saisir.
   *
   * Le scénario est celui du dépôt : « −5 € sur la famille pains », une
   * baguette à 2,00 €.
   */
  it("🔴 accepte un prix ramené à zéro par une remise en euros", () => {
    const line = OrderLine.create({
      ...base,
      unitPriceMillicents: 0,
      quantity: 1,
      pricing: {
        basePriceMillicents: 200_000,
        steps: [
          {
            stage: "promotion",
            ruleId: "rule_cadeau",
            label: "−5 € sur les pains",
            scope: null,
            resultMillicents: -300_000,
            supersedes: [],
          },
        ],
        floored: false,
        clampedToZero: true,
        floorDecision: null,
        commitment: null,
        rejected: [],
      },
    });

    expect(line.unitPriceMillicents).toBe(0);
    expect(line.lineTotalCents).toBe(0);
    expect(line.pricing?.clampedToZero).toBe(true);
  });

  /**
   * Le ramené-à-zéro n'est pas un laissez-passer : il autorise **un** écart
   * précis — la chaîne finit sous zéro, la ligne facture zéro. Une trace qui
   * annoncerait autre chose reste refusée, sans quoi le champ deviendrait la
   * façon d'éteindre le contrôle.
   */
  it("refuse un ramené-à-zéro qui ne facture pas zéro", () => {
    expect(() =>
      OrderLine.create({
        ...base,
        unitPriceMillicents: 150_000,
        quantity: 1,
        pricing: {
          basePriceMillicents: 200_000,
          steps: [
            {
              stage: "promotion",
              ruleId: "rule_cadeau",
              label: "−5 €",
              scope: null,
              resultMillicents: -300_000,
              supersedes: [],
            },
          ],
          floored: false,
          clampedToZero: true,
          floorDecision: null,
          commitment: null,
          rejected: [],
        },
      }),
    ).toThrow(InvalidOrderLineError);
  });

  /**
   * `null` = trace **antérieure au 2026-09-09**, quand la colonne n'existait
   * pas. On ne sait alors pas si la chaîne a été ramenée à zéro, et le contrôle
   * reste celui d'avant : c'est ce qui empêche une commande déjà passée de
   * devenir illisible.
   */
  it("laisse passer une trace antérieure, qui ne sait pas", () => {
    const line = OrderLine.create({
      ...base,
      quantity: 1,
      pricing: {
        basePriceMillicents: 200_000,
        steps: [],
        floored: false,
        clampedToZero: null,
        floorDecision: null,
        commitment: null,
        // Antérieure aussi sur ce champ-là : `null` avoue qu'on ne consignait
        // pas les règles écartées, quand `[]` affirmerait qu'il n'y en a eu
        // aucune.
        rejected: null,
      },
    });

    expect(line.pricing?.clampedToZero).toBeNull();
  });
});
