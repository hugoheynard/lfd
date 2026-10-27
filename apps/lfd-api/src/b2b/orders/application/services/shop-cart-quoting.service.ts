import type {
  ShopQuoteFulfillment,
  ShopQuoteLineView,
  ShopQuotePayload,
  ShopQuoteView,
} from "@lfd/contracts";
import {
  lineTotalCents,
  ttcCentsOf,
  ventilateVat,
  type VatLine,
  type VatVentilationInput,
} from "@lfd/money";
import { Injectable } from "@nestjs/common";
import type { CartAdjustment } from "@lfd/contracts";

import { Clock } from "../../../../platform/time/clock.js";
import {
  VoucherNotForCompanyOrderError,
  VoucherRequiresSignInError,
} from "../../domain/errors/order-voucher-errors.js";
import { LoyaltyVoucherQuoteReader } from "../../domain/ports/loyalty-voucher-quote.reader.js";
import { OrderDeliveryVatReader } from "../../domain/ports/order-delivery-vat.reader.js";
import { deliveryExtraOf } from "../../domain/services/vat.js";
import { voucherImputationCents } from "../../domain/services/voucher-imputation.js";
import { pickupDiscountBaseOf } from "../../domain/services/pickup-discount-base.js";
import type { PricedLine } from "../../domain/services/pickup-discount-eligibility.js";
import { voucherTotalEffectCents } from "../../domain/services/voucher-total-effect.js";
import type { OrderVoucher } from "../../domain/entities/order.js";
import { placementVatMethodOf } from "../../domain/value-objects/order-vat-method.js";
import { exactShopQuoteOf } from "./exact-shop-quote.js";

import { CartAdjustments } from "./cart-adjustments.service.js";
import { CustomerAudiences } from "./customer-audiences.service.js";
import { OrderOperations } from "./order-operations.service.js";
import { OrderLinePricing } from "./order-line-pricing.service.js";

/**
 * Ce que demande un décompte : le panier, la société pour laquelle on chiffre
 * (`null` = visiteur ou espace personnel), la personne connectée (`null` sur la
 * route anonyme). Les deux derniers sont résolus au serveur, jamais reçus.
 */
export interface ShopCartQuoteRequest {
  readonly payload: ShopQuotePayload;
  readonly companyId: string | null;
  readonly buyerUserId: string | null;
}

/**
 * Le décompte **et** ce que le bon a baissé du TTC. Deux champs plutôt qu'une
 * vue élargie : le devis anonyme ne doit pas porter la clé (contrat servi,
 * plan des points E2.1), et un spread de la vue l'y ferait passer.
 */
export interface ShopCartQuote {
  readonly view: ShopQuoteView;
  readonly voucherTotalEffectCents: number;
}

/** Ce que l'acheminement retire et ajoute, hors taxe. */
interface CartTerms {
  readonly discountCents: number;
  readonly discountAdjustment: ShopQuoteView["discountAdjustment"];
  /** Les SKU que la remise du point ne couvre pas. */
  readonly ineligibleSkus: ReadonlySet<string>;
  readonly deliveryFeeCents: number;
  /** Le barème de la zone, `null` hors coursier — la commande `exact_ht` le rejoue en TTC. */
  readonly deliveryFeeAdjustment: CartAdjustment | null;
}

const NO_TERMS: CartTerms = {
  discountCents: 0,
  discountAdjustment: null,
  ineligibleSkus: new Set(),
  deliveryFeeCents: 0,
  deliveryFeeAdjustment: null,
};

/**
 * **Le décompte du panier**, partagé par le devis anonyme et le devis connecté
 * (plan des points, E1.2) : deux requêtes, une seule arithmétique. Extrait de
 * `QuoteShopCartHandler` pour que le devis connecté y ajoute ses points sans
 * appeler un handler depuis un autre.
 */
@Injectable()
export class ShopCartQuoting {
  constructor(
    private readonly pricing: OrderLinePricing,
    private readonly adjustments: CartAdjustments,
    private readonly audiences: CustomerAudiences,
    private readonly operations: OrderOperations,
    private readonly voucherQuotes: LoyaltyVoucherQuoteReader,
    private readonly clock: Clock,
    private readonly deliveryVat: OrderDeliveryVatReader,
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
  async quote(query: ShopCartQuoteRequest): Promise<ShopCartQuote> {
    const resolved = await this.pricing.resolve(
      query.payload.lines.map((line) => ({ sku: line.sku, quantity: line.quantity })),
      // `null` pour un visiteur : ce n'est pas un trou à combler, c'est le
      // parcours par défaut de la boutique, et `applies` le sait déjà.
      { companyId: query.companyId },
      "cart",
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
    const terms = await this.termsOf(
      query.payload.fulfillment,
      lines.map((line) => ({ sku: line.sku, htCents: line.lineTotalCents })),
      query.companyId,
    );
    // 🔴 La méthode de la commande que ce devis annonce — celle qu'`Order.draft`
    // décidera sur la même société, jamais l'audience : un pro ne change pas
    // d'un centime (plan du centime, § 8).
    if (placementVatMethodOf(query.companyId) === "exact_ht") {
      return this.exactQuote(query, resolved, terms);
    }
    const voucherDiscountCents = await this.voucherDiscountOf(
      query,
      subtotalHtCents - terms.discountCents,
    );

    // Le MÊME lecteur que la passation (plan TVA des frais de port, V4) : si le
    // réglage change entre le devis et la commande, la passation fait foi.
    const deliveryVatMode = await this.deliveryVat.current();
    const ventilation: VatVentilationInput = {
      lines: lines.map((line): VatLine => ({
        htCents: line.lineTotalCents,
        vatRate: line.vatRatePercent,
        discountEligible: !terms.ineligibleSkus.has(line.sku),
      })),
      // Les deux remises sur leurs assiettes, comme dans `computeOrderTotals` :
      // celle du point sur les lignes qu'elle couvre, le bon sur toutes (V2).
      eligibleDiscountCents: terms.discountCents,
      discountCents: voucherDiscountCents,
      // Le coursier est un terme HORS remise — on ne fait pas de geste
      // commercial sur une prestation —, taxé selon le mode réglé, traduit par
      // la même fonction que `computeOrderTotals`.
      extras:
        terms.deliveryFeeCents === 0
          ? []
          : [deliveryExtraOf(terms.deliveryFeeCents, deliveryVatMode)],
    };
    const ventilated = ventilateVat(ventilation);
    // « Remise retrait sur X € éligibles » : la clé n'existe que si une ligne
    // est exclue d'une remise qui s'applique (lot C).
    const base = pickupDiscountBaseOf(
      terms.discountAdjustment !== null,
      lines.map((line) => ({
        sku: line.sku,
        lineTotalCents: line.lineTotalCents,
        lineTotalTtcCents: line.lineTotalTtcCents,
        eligible: !terms.ineligibleSkus.has(line.sku),
      })),
    );

    const view: ShopQuoteView = {
      lines,
      subtotalHtCents: ventilated.subtotalHtCents,
      // `ventilated.discountCents` porte la somme des deux : on les rend à part.
      discountCents: terms.discountCents,
      discountAdjustment: terms.discountAdjustment,
      ...(base === null ? {} : { pickupDiscountBase: base }),
      voucherDiscountCents,
      deliveryFeeCents: terms.deliveryFeeCents,
      deliveryVatMode,
      vat: ventilated.vat.map((share) => ({ rate: share.rate, amountCents: share.amountCents })),
      totalCents: ventilated.totalCents,
    };
    return {
      view,
      voucherTotalEffectCents: voucherTotalEffectCents(ventilation, voucherDiscountCents),
    };
  }

  /**
   * Ce que le bon déduit, **comme la commande le déduira** : après la remise,
   * plafonné aux marchandises restantes, borné à zéro — la règle de
   * `Order.draft` (plan des points, C1).
   *
   * Le mur : le bon doit appartenir à la personne connectée, c'est la lecture
   * de la fidélité qui le vérifie. Sans personne (route anonyme), ou pour une
   * société, un bon nommé est refusé plutôt qu'ignoré — l'ignorer afficherait
   * un total que la commande contredirait.
   *
   * @throws {VoucherRequiresSignInError} un bon dans un devis anonyme.
   * @throws {VoucherNotForCompanyOrderError} un bon dans un devis de société.
   */
  private async voucherDiscountOf(
    query: ShopCartQuoteRequest,
    goodsAfterDiscountCents: number,
  ): Promise<number> {
    const voucher = await this.voucherOf(query);
    return voucher === null
      ? 0
      : voucherImputationCents(voucher.valueCents, goodsAfterDiscountCents);
  }

  /**
   * Le bon nommé, lu sous le mur de la personne — ou `null` sans bon.
   *
   * @throws {VoucherRequiresSignInError} un bon dans un devis anonyme.
   * @throws {VoucherNotForCompanyOrderError} un bon dans un devis de société.
   */
  private async voucherOf(query: ShopCartQuoteRequest): Promise<OrderVoucher | null> {
    const voucherId = query.payload.voucherId;
    if (voucherId === undefined) {
      return null;
    }
    if (query.buyerUserId === null) {
      throw new VoucherRequiresSignInError();
    }
    if (query.companyId !== null) {
      throw new VoucherNotForCompanyOrderError();
    }
    return this.voucherQuotes.quote(voucherId, query.buyerUserId, this.clock.now());
  }

  /**
   * Le devis d'un particulier, composé en TTC comme sa commande le sera
   * (`exact_ht`) : le bon à sa valeur faciale TTC, la remise et le port
   * rejoués en TTC depuis leurs réglages (plan du centime, § 5).
   */
  private async exactQuote(
    query: ShopCartQuoteRequest,
    resolved: readonly { readonly line: OrderLineOf }[],
    terms: CartTerms,
  ): Promise<ShopCartQuote> {
    const voucher = await this.voucherOf(query);
    return exactShopQuoteOf({
      lines: resolved.map(({ line }) => ({
        sku: line.sku,
        quantity: line.quantity,
        unitPriceMillicents: line.unitPriceMillicents,
        vatRate: line.vatRate,
      })),
      ineligibleSkus: terms.ineligibleSkus,
      discountAdjustment: terms.discountAdjustment,
      deliveryFeeAdjustment: terms.deliveryFeeAdjustment,
      deliveryVatMode: await this.deliveryVat.current(),
      voucherFaceCents: voucher?.valueCents ?? 0,
    });
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
   * @throws {PickupClosedForAudienceError} le site ne remet pas à la clientèle.
   */
  private async termsOf(
    fulfillment: ShopQuoteFulfillment | null,
    priced: readonly PricedLine[],
    companyId: string | null,
  ): Promise<CartTerms> {
    if (fulfillment === null) {
      return NO_TERMS;
    }
    const audience = await this.audiences.of(companyId);
    if (fulfillment.method === "pickup") {
      const retrait = await this.adjustments.forPickup(
        fulfillment.pickupAddressId,
        priced,
        audience,
        companyId,
      );
      return {
        discountCents: retrait.discountCents,
        discountAdjustment: retrait.discountAdjustment,
        ineligibleSkus: retrait.ineligibleSkus,
        deliveryFeeCents: 0,
        deliveryFeeAdjustment: null,
      };
    }
    const coursier = await this.adjustments.forDelivery(
      fulfillment.codePostal,
      priced.reduce((sum, line) => sum + line.htCents, 0),
      audience,
    );
    // Le coursier n'ouvre droit à aucune remise : c'est le retrait qui en porte une.
    return {
      discountCents: 0,
      discountAdjustment: null,
      ineligibleSkus: new Set(),
      deliveryFeeCents: coursier.feeCents,
      deliveryFeeAdjustment: coursier.feeAdjustment,
    };
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
