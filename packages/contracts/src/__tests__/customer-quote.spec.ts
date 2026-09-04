import { toCustomerQuote } from "../order.js";
import type { OrderQuoteView } from "../order.js";

/**
 * **Le mur entre le devis du comptoir et celui du client.**
 *
 * `POST /orders/quote` est une surface client, et elle rendait la vue staff
 * entière. Le mur du devis protège la mercuriale d'un CONCURRENT ; il ne
 * protégeait pas la machinerie qui fabrique nos prix contre le client lui-même.
 *
 * Ces cas sont la barrière qui survit à quelqu'un qui n'a pas lu le commentaire
 * de `toCustomerQuote` : ils portent sur les CLÉS, jamais sur des absences une à
 * une. Un champ ajouté demain à la vue staff passerait entre les mailles d'une
 * liste d'absences ; il ne passe pas entre celles d'un jeu de clés exact.
 */
const STAFF_QUOTE: OrderQuoteView = {
  subtotalCents: 2_400,
  lines: [
    {
      sku: "VIE-001",
      productName: "Croissant",
      canonicalMillicents: 200_000,
      unitPriceMillicents: 180_000,
      quantity: 12,
      vatRate: 5.5,
      steps: [
        {
          ruleId: "promo_hiver",
          label: "Promotion d'hiver",
          stage: "promotion",
          scope: "global",
          fromMillicents: 200_000,
          toMillicents: 180_000,
        },
      ],
      floored: true,
      sealedByRuleId: "merc_2026",
      sealedRuleIds: ["promo_hiver"],
      volumeTiers: [{ minQuantity: 50, unitPriceMillicents: 160_000, discountBp: 2000 }],
      floorMillicents: 150_000,
    },
  ],
};

describe("toCustomerQuote", () => {
  it("ne laisse passer que ce qui répond à « combien ça me coûte »", () => {
    const line = toCustomerQuote(STAFF_QUOTE).lines[0];

    expect(Object.keys(line ?? {}).sort()).toEqual([
      "canonicalMillicents",
      "productName",
      "quantity",
      "sku",
      "unitPriceMillicents",
      "vatRate",
      "volumeTiers",
    ]);
  });

  /**
   * Le même fait, dit par les noms : quand ce test rougit, le message nomme le
   * champ qui fuit au lieu de montrer deux listes à comparer à l'œil.
   */
  it.each([
    // Le chemin du prix : l'identifiant ET le libellé commercial de chaque
    // règle, plus les rivales qu'elle a évincées.
    "steps",
    // Ce que la mercuriale a scellé, et contre quoi.
    "sealedByRuleId",
    "sealedRuleIds",
    // Le plancher, c'est-à-dire la marge.
    "floorMillicents",
    // Il ne dit pas un montant, mais il dit qu'un plancher EXISTE et qu'il a
    // mordu — un bit de marge reste de la marge.
    "floored",
  ])("ne rend pas « %s » au client", (field) => {
    expect(toCustomerQuote(STAFF_QUOTE).lines[0]).not.toHaveProperty(field);
  });

  it("rend le prix, le tarif d'entrée et la grille tels quels", () => {
    // Ce qui reste doit rester : rétrécir n'est utile que si le client garde de
    // quoi décider — ce qu'il paie, ce que ça valait, et à partir de quand ça
    // baisse.
    const quote = toCustomerQuote(STAFF_QUOTE);

    expect(quote.subtotalCents).toBe(2_400);
    expect(quote.lines[0]).toMatchObject({
      canonicalMillicents: 200_000,
      unitPriceMillicents: 180_000,
      volumeTiers: [{ minQuantity: 50, unitPriceMillicents: 160_000, discountBp: 2000 }],
    });
  });
});
