import type { OrderClientele, OrderStatus, PaymentStatus } from "@lfd/contracts";

import { absorbedByPlan, settlementAllowsProduction } from "../production-plan.js";

/** Le règlement d'un client au compte : il n'a rien à payer en ligne. */
const ON_ACCOUNT: PaymentStatus = "not_required";

/** Un client pro — celui qui a un compte, un historique et un téléphone. */
const PRO: OrderClientele = "pro";

describe("le plan du soir", () => {
  it("absorbe une commande passée — c'est exactement ce qu'il attend", () => {
    expect(absorbedByPlan("placed", ON_ACCOUNT, PRO)).toBe(true);
  });

  it.each<OrderStatus>(["confirmed", "in_production", "ready", "fulfilled"])(
    "ne fait pas RECULER une commande déjà à l'état %s",
    (status) => {
      // Les états ne reculent jamais. Reconfirmer une commande déjà en
      // fabrication effacerait le fait qu'elle l'était.
      expect(absorbedByPlan(status, ON_ACCOUNT, PRO)).toBe(false);
    },
  );

  it("laisse une commande annulée dehors — elle n'est plus à produire", () => {
    expect(absorbedByPlan("cancelled", ON_ACCOUNT, PRO)).toBe(false);
  });

  it("laisse un brouillon dehors — il n'existe pas encore", () => {
    expect(absorbedByPlan("draft", ON_ACCOUNT, PRO)).toBe(false);
  });

  it("rend la clôture IDEMPOTENTE par sa règle, pas par un garde", () => {
    // Une journée close une seconde fois ne contient plus aucune `placed` :
    // zéro commande à absorber, sans qu'aucun verrou n'ait été posé.
    const secondPass = (["confirmed", "cancelled"] as const).filter((status) =>
      absorbedByPlan(status, ON_ACCOUNT, PRO),
    );

    expect(secondPass).toEqual([]);
  });
});

/**
 * 🔴 **Régression : le plan ne regardait QUE le statut de commande** (corrigé le
 * 2026-09-17). `status` et `paymentStatus` sont deux colonnes indépendantes ;
 * une commande dont le paiement avait explicitement échoué restait `placed`, et
 * le fournil la fabriquait. Inoffensif tant que le tunnel était pro — un compte
 * est `not_required` — et courant dès que le public paie par carte.
 */
describe("le plan du soir et le RÈGLEMENT", () => {
  it.each<PaymentStatus>(["failed", "refunded"])(
    "🔴 ne produit JAMAIS un règlement %s, quelle que soit la clientèle",
    (payment) => {
      expect(absorbedByPlan("placed", payment, PRO)).toBe(false);
      expect(absorbedByPlan("placed", payment, "public")).toBe(false);
      expect(absorbedByPlan("placed", payment, null)).toBe(false);
    },
  );

  it("produit ce qui est payé, et ce qui n'a pas à l'être", () => {
    expect(absorbedByPlan("placed", "paid", PRO)).toBe(true);
    expect(absorbedByPlan("placed", "not_required", PRO)).toBe(true);
    expect(absorbedByPlan("placed", "paid", "public")).toBe(true);
  });

  it("un règlement refusé ne ressuscite pas un état déjà dépassé", () => {
    // La condition de statut reste la première : `failed` ne change rien à une
    // commande qui a déjà quitté `placed`.
    expect(absorbedByPlan("confirmed", "failed", PRO)).toBe(false);
  });
});

/**
 * 🔴 **Le règlement EN VOL ne vaut que pour qui a un compte** (Hugo,
 * 2026-09-17 : « on restreint au public pour le moment »).
 *
 * Ces trois cas tiennent la règle ET son exception nullable, qui est la plus
 * facile à casser : `clientele` est nullable **pour toujours** sur les commandes
 * antérieures à la distinction, et « sans société » n'a jamais voulu dire
 * « public ».
 */
describe("le plan du soir et la CLIENTÈLE", () => {
  it("🔴 ne produit PAS un visiteur dont le règlement est encore en vol", () => {
    // Une carte abandonnée n'émet aucun événement Stripe : sa commande
    // resterait `pending` pour toujours, et serait fabriquée chaque nuit.
    expect(absorbedByPlan("placed", "pending", "public")).toBe(false);
  });

  it("produit un PRO dont le règlement est encore en vol", () => {
    // Il a un compte et quelqu'un à appeler. Ne pas le produire parce que son
    // webhook a quelques secondes de retard coûterait une commande payée non
    // servie — plus cher qu'une marchandise perdue.
    expect(absorbedByPlan("placed", "pending", PRO)).toBe(true);
  });

  it("🔴 traite une clientèle INCONNUE comme « pas public »", () => {
    // Les commandes d'avant la distinction portent `null`. Les faire sortir du
    // plan parce qu'on ignore leur origine retirerait de la production des
    // commandes parfaitement légitimes.
    expect(absorbedByPlan("placed", "pending", null)).toBe(true);
  });
});

/**
 * 🔴 **Régression : le DOSSIER DU JOUR imprimait ce que le plan refusait**
 * (corrigé le 2026-09-17, Hugo : « sur l'impression du dossier à arrêt de
 * production »).
 *
 * La liasse de bons écartait les seules commandes annulées. Un règlement mort ou
 * un visiteur dont la carte était restée en l'air recevait donc son bon au
 * fournil, alors que la fournée et le colisage — qui lisent `planWhere` — n'en
 * savaient rien. Mesuré ce jour-là sur la base de développement : **9 bons au
 * dossier du lendemain contre 0 au compte à produire**.
 *
 * Ce qui suit tient la moitié PARTAGÉE, et surtout ce qu'elle ne dit PAS : le
 * statut. Une fusion complète des deux règles est la faute suivante, et elle
 * serait invisible — le dossier se viderait à l'arrêt de la journée, c'est-à-dire
 * juste avant qu'on l'imprime.
 */
describe("l'argent, sans le statut — ce que le plan et le dossier PARTAGENT", () => {
  it.each<PaymentStatus>(["failed", "refunded"])(
    "🔴 n'imprime JAMAIS un bon pour un règlement %s",
    (payment) => {
      expect(settlementAllowsProduction(payment, PRO)).toBe(false);
      expect(settlementAllowsProduction(payment, "public")).toBe(false);
      expect(settlementAllowsProduction(payment, null)).toBe(false);
    },
  );

  it("🔴 n'imprime PAS un visiteur dont le règlement est encore en vol", () => {
    expect(settlementAllowsProduction("pending", "public")).toBe(false);
  });

  it("imprime un PRO en vol, et une clientèle inconnue", () => {
    expect(settlementAllowsProduction("pending", PRO)).toBe(true);
    expect(settlementAllowsProduction("pending", null)).toBe(true);
  });

  it("🔴 NE PORTE PAS de condition de statut — c'est tout son objet", () => {
    // Le dossier garde ce qui est déjà prêt ou déjà remis : sa pile numérotée
    // est la preuve qu'il ne manque pas une feuille. Si cette assertion tombe,
    // c'est que la règle du plan a été recopiée ici en entier — et le dossier
    // sortira VIDE de l'imprimante, une fois la journée arrêtée.
    for (const status of ["confirmed", "ready", "fulfilled"] as const) {
      expect(absorbedByPlan(status, ON_ACCOUNT, PRO)).toBe(false);
    }
    expect(settlementAllowsProduction(ON_ACCOUNT, PRO)).toBe(true);
  });

  it("reste le MIROIR exact de la règle du plan sur une commande passée", () => {
    // Les deux ne peuvent diverger que par le statut. Sur `placed`, elles disent
    // forcément la même chose — sinon le dossier et le compte à produire
    // repartiraient chacun de leur côté, ce qui est exactement le bug d'origine.
    const cases: readonly [PaymentStatus, OrderClientele | null][] = [
      ["paid", PRO],
      ["paid", "public"],
      ["not_required", PRO],
      ["pending", PRO],
      ["pending", "public"],
      ["pending", null],
      ["failed", PRO],
      ["refunded", "public"],
    ];

    for (const [payment, clientele] of cases) {
      expect(settlementAllowsProduction(payment, clientele)).toBe(
        absorbedByPlan("placed", payment, clientele),
      );
    }
  });
});
