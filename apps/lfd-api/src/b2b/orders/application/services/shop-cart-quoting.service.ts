import type { ShopQuotePayload, ShopQuoteView } from "@lfd/contracts";
import { Injectable, Logger } from "@nestjs/common";

import { Clock } from "../../../../platform/time/clock.js";
import {
  VoucherNotForCompanyOrderError,
  VoucherRequiresSignInError,
} from "../../domain/errors/order-voucher-errors.js";
import { LoyaltyVoucherQuoteReader } from "../../domain/ports/loyalty-voucher-quote.reader.js";
import { OrderDeliveryVatReader } from "../../domain/ports/order-delivery-vat.reader.js";
import { OrderLineClassificationReader } from "../../domain/ports/order-line-classification.reader.js";
import type { OrderVoucher } from "../../domain/entities/order.js";
import type { PartialBasketPricingContext } from "../../domain/services/basket-pricing-context.js";
import { priceBasket } from "../../domain/services/price-basket.js";
import { placementVatMethodOf } from "../../domain/value-objects/order-vat-method.js";
import {
  GUEST_BUYER,
  REGISTERED_BUYER,
  type OrderBuyerKind,
} from "../../domain/value-objects/order-buyer-kind.js";
import { handoverMomentOf } from "../../domain/services/handover-moment.js";

import { warnBeyondCap } from "./basket-promotions.service.js";
import { CartAdjustments } from "./cart-adjustments.service.js";
import { LateFeeJudgement } from "./late-fee-judgement.service.js";
import { GuestSignInOffer } from "./guest-sign-in-offer.service.js";
import { CustomerAudiences } from "./customer-audiences.service.js";
import { OrderOperations } from "./order-operations.service.js";
import { OrderLinePricing, type ResolvedOrderLine } from "./order-line-pricing.service.js";
import { PricingContext } from "./pricing-context.service.js";
import { shopQuoteOf, type ShopCartQuote } from "./shop-quote-view.js";

export type { ShopCartQuote } from "./shop-quote-view.js";

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
 * **Le décompte du panier**, partagé par le devis anonyme et le devis connecté
 * (plan des points, E1.2) : deux requêtes, une seule arithmétique. Extrait de
 * `QuoteShopCartHandler` pour que le devis connecté y ajoute ses points sans
 * appeler un handler depuis un autre.
 */
@Injectable()
export class ShopCartQuoting {
  private readonly logger = new Logger(ShopCartQuoting.name);
  private readonly context: PricingContext;

  constructor(
    private readonly pricing: OrderLinePricing,
    adjustments: CartAdjustments,
    audiences: CustomerAudiences,
    private readonly operations: OrderOperations,
    private readonly voucherQuotes: LoyaltyVoucherQuoteReader,
    private readonly clock: Clock,
    deliveryVat: OrderDeliveryVatReader,
    private readonly signIn: GuestSignInOffer,
    classifications: OrderLineClassificationReader,
    private readonly lateFee: LateFeeJudgement,
  ) {
    // Le chargement même de la passation (plan `le-prix-d-un-panier.md`,
    // § 2.1, lot L2) : mêmes lectures, même ordre, panier partiel admis.
    this.context = new PricingContext(
      pricing,
      adjustments,
      classifications,
      audiences,
      deliveryVat,
    );
  }

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
  async quote(request: ShopCartQuoteRequest): Promise<ShopCartQuote> {
    // Une ligne dont l'article a changé d'unité est RETIRÉE, jamais convertie
    // (`plan-changer-l-unite-de-vente.md`, § 8) ; le client la rajoute.
    const { resolved, kept, removed } = await this.pricing.resolveWithoutStaleUnits(
      request.payload.lines,
      // `null` pour un visiteur : ce n'est pas un trou à combler, c'est le
      // parcours par défaut de la boutique, et `applies` le sait déjà. La
      // porte d'entrée se lit sur la ROUTE (L10), comme au panier.
      { companyId: request.companyId, buyerKind: buyerKindOf(request) },
      "cart",
    );
    const { quoted, known } = await this.quoteKept(
      { ...request, payload: { ...request.payload, lines: [...kept] } },
      resolved,
    );
    // Ce qu'une connexion ouvrirait (L10) — au seul devis anonyme, sur le
    // rangement que le chargement vient de lire pour les mêmes lignes.
    const signInOffer = await this.signIn.offerFor(request, resolved, known);
    const view: ShopQuoteView = {
      ...quoted.view,
      ...(removed.length === 0
        ? {}
        : { removedLines: removed.map((line) => ({ ...line, reason: "sale_unit_changed" })) }),
      ...(signInOffer === undefined ? {} : { signInOffer }),
    };
    return { ...quoted, view };
  }

  private async quoteKept(
    query: ShopCartQuoteRequest,
    // Tarifées par la même lecture du catalogue que le tri des unités.
    resolved: readonly ResolvedOrderLine[],
  ): Promise<KeptQuote> {
    // Sans jour — le devis de la boutique n'en porte pas —, mais une bûche
    // pas encore ouverte, close ou introuvable le dit ici, au panier, plutôt
    // qu'au paiement ; et une ligne qui ne passera plus nomme son cas au lieu
    // de « SKU inconnu » (D6 du plan des opérations datées).
    await this.operations.ensure(query.payload.lines, query.companyId);
    const loaded = await this.context.loadCart({
      resolved,
      parties: { companyId: query.companyId, buyerKind: buyerKindOf(query) },
      fulfillment: query.payload.fulfillment,
    });
    // Le devis lève ses refus de lecture, comme avant L2 : le point fermé à
    // la clientèle, la livraison fermée, le code postal hors zone.
    if (loaded.loaded === null) {
      throw loaded.refusals[0];
    }
    const voucher = await this.voucherOf(query);
    // 🔴 La méthode de la commande que ce devis annonce — celle qu'`Order.draft`
    // décidera sur la même société, jamais l'audience.
    const vatMethod = placementVatMethodOf(query.companyId);
    const priced = priceBasket(
      loaded.loaded,
      {
        vatMethod,
        // L'instant jugé par la fonction même de la passation (§ 2.18).
        handoverAt: handoverMomentOf(
          query.payload.requestedDeliveryDate ?? null,
          query.payload.requestedWindow,
        ),
      },
      // La surtaxe prévue, par le jugement de la passation sans dépenser la
      // dérogation (É11, plan `le-prix-d-un-panier.md`, T1) : rien sans société,
      // sans jour, sans dérogation ouverte ou sans réglage.
      {
        lateFee: await this.lateFee.foreseen(
          query.companyId,
          query.payload.lines.map((line) => line.sku),
          query.payload.requestedDeliveryDate ?? null,
        ),
      },
    );
    warnBeyondCap(this.logger, priced);
    const quoted = shopQuoteOf(priced, {
      companyId: query.companyId,
      voucher,
      method: query.payload.fulfillment?.method ?? null,
      vatMethod,
    });
    return { quoted, known: loaded.loaded.known };
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
}

/** Le devis des lignes gardées, et le rangement de leurs articles lu pour le chiffrer. */
interface KeptQuote {
  readonly quoted: ShopCartQuote;
  readonly known: PartialBasketPricingContext["known"];
}

/**
 * **La porte d'entrée d'un devis**, lue sur la ROUTE (plan des promotions,
 * § 13.7) : le devis anonyme ne porte personne (`buyerUserId` nul), le devis
 * reconnu porte le `Principal` résolu en base. Jamais un champ du corps.
 */
function buyerKindOf({ buyerUserId }: Pick<ShopCartQuoteRequest, "buyerUserId">): OrderBuyerKind {
  return buyerUserId === null ? GUEST_BUYER : REGISTERED_BUYER;
}
