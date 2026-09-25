import type {
  ShopQuoteFulfillment,
  ShopQuoteLineView,
  ShopQuotePayload,
  ShopQuoteView,
} from "@lfd/contracts";
import {
  DELIVERY_VAT_RATE,
  lineTotalCents,
  ttcCentsOf,
  ventilateVat,
  type VatLine,
} from "@lfd/money";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { CartAdjustments } from "../services/cart-adjustments.service.js";
import { CustomerAudiences } from "../services/customer-audiences.service.js";
import { OrderOperations } from "../services/order-operations.service.js";
import { OrderLinePricing } from "../services/order-line-pricing.service.js";

/**
 * **Ce que le panier de la boutique coûte** — sans jeton, sans commande.
 *
 * Une requête : elle ne mute rien, elle répond. Le panier l'appelle à chaque
 * changement de contenu ou de mode de service, parce que le décompte dépend des
 * deux et qu'aucun des deux ne se calcule dans un navigateur.
 */
export class QuoteShopCartQuery {
  constructor(
    readonly payload: ShopQuotePayload,
    /**
     * La société pour laquelle on chiffre, ou `null` = visiteur.
     *
     * Résolue au serveur et transmise par le contrôleur — jamais reçue du
     * client. La route publique passe `null` ; la route reconnue passe ce que
     * le guard a résolu depuis les rattachements. Elle décide aussi la
     * CLIENTÈLE (remise du point, livraison ouverte) : B2B pour une société
     * active, B2C sinon.
     */
    readonly companyId: string | null = null,
  ) {}
}

/** Ce que l'acheminement retire et ajoute, hors taxe. */
interface CartTerms {
  readonly discountCents: number;
  readonly discountAdjustment: ShopQuoteView["discountAdjustment"];
  readonly deliveryFeeCents: number;
}

const NO_TERMS: CartTerms = {
  discountCents: 0,
  discountAdjustment: null,
  deliveryFeeCents: 0,
};

@QueryHandler(QuoteShopCartQuery)
export class QuoteShopCartHandler implements IQueryHandler<QuoteShopCartQuery, ShopQuoteView> {
  constructor(
    private readonly pricing: OrderLinePricing,
    private readonly adjustments: CartAdjustments,
    private readonly audiences: CustomerAudiences,
    private readonly operations: OrderOperations,
  ) {}

  /**
   * Le décompte, **dans l'ordre d'une facture**.
   *
   * 🔴 **Trois règles vivent ici, et aucune n'est réécrite ailleurs :**
   *
   * 1. **le prix se résout à la QUANTITÉ**, par le service qui facture. Le
   *    panier faisait `prix × quantité` dans le navigateur : exact tant qu'aucun
   *    palier n'existe, faux **en silence** le jour où un barème ouvert à tous
   *    est posé, parce qu'une multiplication continue de rendre un nombre
   *    plausible ;
   * 2. **la remise et les frais viennent de la base**, par le même service que
   *    la caisse — donc un point de retrait dont la remise est un MONTANT est
   *    servi juste, ce que le front ne savait pas représenter ; et pour la même
   *    clientèle que la caisse, déduite du statut de la société ;
   * 3. **la TVA se ventile par `ventilateVat`**, la fonction même dont
   *    `Order.draft` se sert. Un devis qui ne prédit pas la facture ne sert à
   *    rien, et deux implémentations finissent toujours par diverger.
   *
   * ⚠️ **Sans société, sans mercuriale** — et c'est le cas du visiteur : seules
   * les règles ouvertes à TOUS s'appliquent, une promotion publique, un barème
   * de volume global. C'est exactement ce qu'un visiteur paiera.
   *
   * ✅ _(2026-09-08)_ Avec une société, ce même décompte porte le tarif négocié.
   * Le second chemin annoncé par `shop-catalogue.controller.ts` existe : la
   * route publique passe `null`, la route reconnue passe ce que le guard a
   * résolu. Un seul handler, parce que le décompte est le même — c'est le PRIX
   * qui change, pas la façon de compter.
   */
  async execute(query: QuoteShopCartQuery): Promise<ShopQuoteView> {
    const resolved = await this.pricing.resolve(
      query.payload.lines.map((line) => ({ sku: line.sku, quantity: line.quantity })),
      // `null` pour un visiteur : ce n'est pas un trou à combler, c'est le
      // parcours par défaut de la boutique, et `applies` le sait déjà.
      { companyId: query.companyId },
    );
    // Sans jour — le devis de la boutique n'en porte pas —, mais une bûche
    // pas encore ouverte, close ou introuvable le dit ici, au panier, plutôt
    // qu'au paiement ; et une ligne qui ne passera plus nomme son cas au lieu
    // de « SKU inconnu » (D6 du plan des opérations datées).
    await this.operations.ensure(query.payload.lines, query.companyId);

    const lines = resolved.map(toQuoteLine);
    // Le sous-total est un MONTANT : la somme de totaux DÉJÀ arrondis, un par
    // ligne. C'est ce que fait `Order.draft`, et c'est ce qui fait qu'un seuil
    // de remise se déclenche au même centime des deux côtés.
    const subtotalHtCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
    const terms = await this.termsOf(query.payload.fulfillment, subtotalHtCents, query.companyId);

    const ventilated = ventilateVat({
      lines: lines.map((line): VatLine => ({
        htCents: line.lineTotalCents,
        vatRate: line.vatRatePercent,
      })),
      discountCents: terms.discountCents,
      // Le coursier est un terme HORS remise, au taux du transport : on ne fait
      // pas de geste commercial sur une prestation.
      extras:
        terms.deliveryFeeCents === 0
          ? []
          : [{ htCents: terms.deliveryFeeCents, vatRate: DELIVERY_VAT_RATE }],
    });

    return {
      lines,
      subtotalHtCents: ventilated.subtotalHtCents,
      discountCents: ventilated.discountCents,
      discountAdjustment: terms.discountAdjustment,
      deliveryFeeCents: terms.deliveryFeeCents,
      vat: ventilated.vat.map((share) => ({ rate: share.rate, amountCents: share.amountCents })),
      totalCents: ventilated.totalCents,
    };
  }

  /**
   * Ce que l'acheminement change au panier, **ou rien du tout**.
   *
   * `null` n'est pas un défaut à combler : la boutique laisse composer un panier
   * avant d'avoir dit où l'on est servi, et le décompte est alors celui des
   * marchandises seules. Inventer une remise ou des frais à ce moment-là
   * annoncerait un total que le choix suivant contredirait.
   *
   * La clientèle n'est lue qu'une fois un service choisi : sans acheminement,
   * elle ne change rien au décompte, et le devis se relance à chaque ligne.
   *
   * @throws {DeliveryClosedForAudienceError} la livraison est fermée à la clientèle.
   */
  private async termsOf(
    fulfillment: ShopQuoteFulfillment | null,
    subtotalHtCents: number,
    companyId: string | null,
  ): Promise<CartTerms> {
    if (fulfillment === null) {
      return NO_TERMS;
    }
    const audience = await this.audiences.of(companyId);
    if (fulfillment.method === "pickup") {
      const retrait = await this.adjustments.forPickup(
        fulfillment.pickupAddressId,
        subtotalHtCents,
        audience,
      );
      return {
        discountCents: retrait.discountCents,
        discountAdjustment: retrait.discountAdjustment,
        deliveryFeeCents: 0,
      };
    }
    const coursier = await this.adjustments.forDelivery(
      fulfillment.codePostal,
      subtotalHtCents,
      audience,
    );
    // Le coursier n'ouvre droit à aucune remise : c'est le retrait qui en porte une.
    return { discountCents: 0, discountAdjustment: null, deliveryFeeCents: coursier.feeCents };
  }
}

/**
 * La ligne résolue → sa vue publique.
 *
 * 🔴 **Rien de la trace ne franchit.** `ResolvedOrderLine` porte l'identifiant et
 * le libellé de chaque règle appliquée, les rivales évincées, le plancher — donc
 * la marge. Cette réponse est servie sans jeton : ce qu'on y ajoute est public
 * le jour du déploiement. La règle de tri est celle de `ShopItemView` — un champ
 * passe s'il répond à « qu'est-ce que c'est, et combien ça coûte ».
 */
function toQuoteLine(resolved: { line: OrderLineOf }): ShopQuoteLineView {
  const { line } = resolved;
  // L'arrondi au centime a lieu UNE fois, ici, et le taxe compris se dérive de
  // ce total-là — pas du prix unitaire remultiplié. C'est ce qui fait qu'une
  // ligne de douze pièces dit la même chose que la caisse.
  const htCents = lineTotalCents(line.unitPriceMillicents, line.quantity);
  return {
    sku: line.sku,
    quantity: line.quantity,
    unitPriceMillicents: line.unitPriceMillicents,
    lineTotalCents: htCents,
    lineTotalTtcCents: ttcCentsOf(htCents, line.vatRate),
    vatRatePercent: line.vatRate,
  };
}

/** Le strict nécessaire de la ligne résolue — le reste ne sort pas d'ici. */
interface OrderLineOf {
  readonly sku: string;
  readonly quantity: number;
  readonly unitPriceMillicents: number;
  readonly vatRate: number;
}
