import { z } from "zod";

import type { CartAdjustment } from "./cart-adjustment.js";

/**
 * **Ce que le panier de la boutique coûte**, demandé au serveur avant de
 * commander.
 *
 * ## Pourquoi une route de plus, et pas `POST /orders/quote`
 *
 * Le devis client exige un jeton : il rend un **prix négocié**, donc il se mure
 * comme la commande qui l'appliquerait. La boutique, elle, est **publique par
 * décision** — on visite d'abord, on s'identifie pour régler — et un prospect
 * sans compte doit voir sa vitrine et son total.
 *
 * Ouvrir le devis client aux anonymes aurait mêlé deux publics sur une route
 * murée. Ce contrat est donc le second chemin que
 * `shop-catalogue.controller.ts` annonçait, symétrique de `GET /shop/catalogue`.
 *
 * ## Ce qu'il répare
 *
 * Le panier faisait `prix × quantité` dans le navigateur, avec une remise et
 * des frais tirés d'une maquette. Trois conséquences, toutes fermées ici :
 *
 * 1. le jour où un **barème de volume** ouvert à tous existe, une
 *    multiplication rend un nombre plausible et faux ;
 * 2. la remise d'un point de retrait peut être un **montant** et pas seulement
 *    un pourcentage — le front ne savait pas la représenter ;
 * 3. la TVA et le total se calculaient deux fois, à deux endroits.
 *
 * 🔴 **Cette réponse est PUBLIQUE.** Elle dit ce qu'un visiteur paierait, donc
 * elle ne porte **aucune trace de résolution** : ni règle, ni libellé d'étage,
 * ni plancher. L'écart entre un tarif reçu et un tarif servi EST la
 * négociation — c'est la règle de tri de `ShopItemView`, et elle vaut ici.
 */

/** Une ligne demandée : une référence du catalogue et sa quantité. */
export const shopQuoteLineSchema = z.object({
  sku: z.string().min(1),
  quantity: z.number().int().positive(),
});

/**
 * L'acheminement retenu, **ou son absence**.
 *
 * `null` est un état de plein droit, pas un trou : la boutique laisse composer
 * un panier avant d'avoir dit où l'on est servi. Le décompte est alors celui des
 * marchandises seules — ni remise, ni frais —, ce qui est exactement vrai.
 */
export const shopQuoteFulfillmentSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal("pickup"),
    /** `null` = le point par défaut, comme à la passation. */
    pickupAddressId: z.string().min(1).nullable(),
  }),
  z.object({
    method: z.literal("delivery"),
    /**
     * Le code postal livré, **et rien d'autre**. La zone s'en DÉDUIT côté
     * serveur : c'est une propriété de l'adresse, pas un choix, donc personne
     * ne peut annoncer un secteur moins cher que le sien.
     */
    codePostal: z.string().min(1).max(16),
  }),
]);

export const shopQuotePayloadSchema = z.object({
  /**
   * Bornées à cent lignes. Une route publique et non authentifiée qui résout
   * des prix est une surface de charge : le panier d'une boulangerie n'atteint
   * pas cent références, et refuser au-delà coûte moins qu'un plafond découvert
   * en production.
   */
  lines: z.array(shopQuoteLineSchema).min(1).max(100),
  fulfillment: shopQuoteFulfillmentSchema.nullable(),
});

export type ShopQuoteLinePayload = z.infer<typeof shopQuoteLineSchema>;
export type ShopQuoteFulfillment = z.infer<typeof shopQuoteFulfillmentSchema>;
export type ShopQuotePayload = z.infer<typeof shopQuotePayloadSchema>;

/** Une ligne tarifée, telle que le décompte la porte. */
export interface ShopQuoteLineView {
  readonly sku: string;
  readonly quantity: number;
  /** Le prix unitaire **HT en millicentimes**, résolu à CETTE quantité. */
  readonly unitPriceMillicents: number;
  /**
   * Le total **HT en centimes** de la ligne, arrondi **une fois**.
   *
   * Rendu par le serveur plutôt que laissé au front : c'est un montant, et le
   * recalculer à l'écran redonnerait deux règles d'arrondi pour un même nombre.
   */
  readonly lineTotalCents: number;
  readonly vatRatePercent: number;
}

/** La TVA d'un taux, telle qu'une facture la porte. */
export interface ShopQuoteVatShare {
  readonly rate: number;
  readonly amountCents: number;
}

/**
 * Le décompte complet, **dans l'ordre d'une facture** — et calculé par la même
 * fonction que la commande (`ventilateVat`).
 *
 * Tous les montants sont en **centimes entiers**. Les prix unitaires restent en
 * millicentimes : un montant s'encaisse, un prix unitaire se dérive.
 */
export interface ShopQuoteView {
  readonly lines: readonly ShopQuoteLineView[];
  /** Les marchandises hors taxe, **avant** remise. */
  readonly subtotalHtCents: number;
  /** Le montant RETIRÉ, positif. Zéro en livraison — le coursier n'en ouvre pas. */
  readonly discountCents: number;
  /**
   * L'ajustement qui l'a produite, **pas un libellé**.
   *
   * Le front sait mettre en forme « −10 % » comme « −2,00 € » ; lui envoyer une
   * phrase toute faite aurait mis une décision d'affichage dans une réponse
   * d'API, et empêché de la traduire.
   */
  readonly discountAdjustment: CartAdjustment | null;
  /** Les frais de coursier, HT. Zéro en retrait — et alors aucune ligne. */
  readonly deliveryFeeCents: number;
  /** Une part par taux RÉELLEMENT présent, du plus bas au plus haut. */
  readonly vat: readonly ShopQuoteVatShare[];
  /** Le total **TTC** — ce qui sera débité. */
  readonly totalCents: number;
}
