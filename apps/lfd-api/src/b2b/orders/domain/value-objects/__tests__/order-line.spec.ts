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
    const line = OrderLine.create({ ...base, quantity: 3 }, "pro");
    expect(line.lineTotalCents).toBe(600);
    expect(line.toSnapshot()).toEqual({
      ...base,
      quantity: 3,
      lineTotalCents: 600,
      unitPriceTtcCents: null,
      lineTotalTtcCents: null,
      pricing: null,
      allergens: null,
    });
  });

  it("refuse une quantité nulle, négative ou non entière", () => {
    expect(() => OrderLine.create({ ...base, quantity: 0 }, "pro")).toThrow(InvalidOrderLineError);
    expect(() => OrderLine.create({ ...base, quantity: -1 }, "pro")).toThrow(InvalidOrderLineError);
    expect(() => OrderLine.create({ ...base, quantity: 1.5 }, "pro")).toThrow(
      InvalidOrderLineError,
    );
  });

  it("refuse un prix unitaire négatif", () => {
    expect(() =>
      OrderLine.create({ ...base, unitPriceMillicents: -1, quantity: 1 }, "pro"),
    ).toThrow(InvalidOrderLineError);
  });

  /**
   * 🔴 Les allergènes se figent comme le prix, et c'était la seule chose que la
   * ligne ne figeait pas. Sans ce gel, une correction de déclaration effaçait
   * ce sous quoi la commande avait été passée — et sur réclamation, la réponse
   * était un blanc.
   */
  it("fige les allergènes qu'on lui donne, codes ET libellés", () => {
    const line = OrderLine.create(
      {
        ...base,
        quantity: 1,
        allergens: {
          codes: ["AU"],
          labels: [{ category: "gluten", label: "gluten" }],
          incomplete: false,
        },
      },
      "pro",
    );

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
    expect(OrderLine.create({ ...base, quantity: 1 }, "pro").toSnapshot().allergens).toBeNull();
  });

  /** Les trois états du référentiel traversent : `[]` AFFIRME, `null` se tait. */
  it("distingue « déclaré sans allergène » de « pas de fiche »", () => {
    const declared = OrderLine.create(
      {
        ...base,
        quantity: 1,
        allergens: { codes: [], labels: [], incomplete: false },
      },
      "pro",
    );

    expect(declared.toSnapshot().allergens?.codes).toEqual([]);
    expect(OrderLine.create({ ...base, quantity: 1 }, "pro").toSnapshot().allergens).toBeNull();
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
    const line = OrderLine.create(
      {
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
      },
      "pro",
    );

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
      OrderLine.create(
        {
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
        },
        "pro",
      ),
    ).toThrow(InvalidOrderLineError);
  });

  /**
   * `null` = trace **antérieure au 2026-09-09**, quand la colonne n'existait
   * pas. On ne sait alors pas si la chaîne a été ramenée à zéro, et le contrôle
   * reste celui d'avant : c'est ce qui empêche une commande déjà passée de
   * devenir illisible.
   */
  it("laisse passer une trace antérieure, qui ne sait pas", () => {
    const line = OrderLine.create(
      {
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
      },
      "pro",
    );

    expect(line.pricing?.clampedToZero).toBeNull();
  });

  /**
   * 🔴 **Un particulier scelle son taxe compris, un professionnel non** (R3,
   * 2026-09-21).
   *
   * Un pro récupère la taxe et ne lit que le hors taxe ; lui sceller un TTC
   * créerait un montant que rien n'affiche et que tout pourrait un jour
   * afficher par erreur. L'absence est donc une décision, pas un trou.
   */
  it("🔴 ne scelle le taxe compris que pour un particulier", () => {
    const perso = OrderLine.create({ ...base, quantity: 3 }, "public");
    const pro = OrderLine.create({ ...base, quantity: 3 }, "pro");

    // 2,00 € HT × 3 = 6,00 € HT → 6,33 € TTC à 5,5 %.
    expect(perso.lineTotalTtcCents).toBe(633);
    expect(pro.lineTotalTtcCents).toBeNull();
    expect(pro.unitPriceTtcCents).toBeNull();
  });

  /**
   * 🔴 **Le prix d'une pièce scellé est celui que la VITRINE a affiché.**
   *
   * Il passe par le même chemin que `shop-catalogue-view.ts` —
   * `ttcCentsOf(lineTotalCents(prix, 1), taux)` —, donc le client retrouve sur
   * son bon le nombre qu'il a lu sur la vignette et dans son panier.
   *
   * Sans ce cas, on pourrait « simplifier » en divisant le total de ligne par
   * la quantité : 633 / 3 = 211, et le bon annoncerait 2,11 € pour une pièce
   * dont l'étiquette dit 2,11 € — juste ici, faux dès que la division ne tombe
   * pas juste.
   */
  it("🔴 scelle la pièce par le chemin de la vitrine, pas par une division", () => {
    const line = OrderLine.create({ ...base, quantity: 3 }, "public");

    expect(line.unitPriceTtcCents).toBe(211);
    // Et le total n'est PAS la pièce multipliée : 211 × 3 = 633 ici, mais
    // l'égalité est une coïncidence de ce taux — les deux sont arrondis
    // séparément, chacun sur son assiette.
    expect(line.lineTotalTtcCents).toBe(633);
  });

  /**
   * Le taxe compris se dérive du total de ligne DÉJÀ arrondi, jamais du prix
   * unitaire remultiplié — c'est la même règle que le hors taxe, un cran plus
   * haut, et elle se voit sur un taux qui ne tombe pas rond.
   */
  it("dérive le TTC du total de ligne arrondi, pas du prix unitaire", () => {
    const line = OrderLine.create(
      { ...base, unitPriceMillicents: 133_333, vatRate: 20, quantity: 7 },
      "public",
    );

    // 1,33333 € × 7 = 9,33331 € → 933 centimes HT → 1 120 centimes TTC.
    expect(line.lineTotalCents).toBe(933);
    expect(line.lineTotalTtcCents).toBe(1_120);
  });
});
