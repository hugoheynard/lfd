import {
  type SalesTermsDocument,
  type StaffEntryShortcut,
  type StaffOrderSupply,
} from "@lfd/contracts";
import { Injectable, Logger } from "@nestjs/common";

import { CartAdjustments } from "./cart-adjustments.service.js";
import { CustomerAudiences } from "./customer-audiences.service.js";
import { DeliveryDefaultsReader } from "../../domain/ports/delivery-defaults.reader.js";
import {
  SUBSCRIPTION_WINDOW,
  windowRequesterOf,
  type WindowRequester,
} from "../../domain/services/delivery-window.js";
import { Order, type OrderSalesTerms, type OrderVoucher } from "../../domain/entities/order.js";
import { ProductionPlanClosedError } from "../../domain/errors/production-plan-closed.error.js";
import { OrderDeliveryVatReader } from "../../domain/ports/order-delivery-vat.reader.js";
import { OrderLineClassificationReader } from "../../domain/ports/order-line-classification.reader.js";
import {
  OrderPayerReader,
  type OrderPayerStanding,
} from "../../domain/ports/order-payer.reader.js";
import { OrderSalesTermsReader } from "../../domain/ports/order-sales-terms.reader.js";
import { salesTermsOf } from "../../domain/services/sales-terms-of.js";
import { orderPayerInHouseOf, orderPayerOf } from "../../domain/services/order-payer.js";
import { orderPrincipalOf } from "../../domain/services/order-principal.js";
import type { OrderEntryOrigin } from "../../domain/value-objects/order-supply.js";
import { OrderDeadline, type ExceededItemLimit } from "../../../order-cutoffs/index.js";
import {
  admitWithinDeadline,
  NOTHING_OWED,
  type DeadlineAdmission,
} from "../../domain/services/admit-within-deadline.js";
import { Clock } from "../../../../platform/time/clock.js";
import {
  IN_HOUSE_ORDER_REASON,
  type OrderOfferReason,
} from "../../domain/value-objects/order-offer.js";
import { warnBeyondCap } from "./basket-promotions.service.js";
import { OrderComposition, pickupSiteOf } from "./order-composition.service.js";
import type { OrderContent } from "./order-content.js";
import { OrderOperations } from "./order-operations.service.js";
import { OrderPlanGate } from "./order-plan-gate.service.js";
import { OrderLinePricing } from "./order-line-pricing.service.js";
import type { OrderParties } from "./order-parties.js";
import type { OrderLocale } from "../../domain/value-objects/order-locale.js";
import { placementVatMethodOf } from "../../domain/value-objects/order-vat-method.js";
import type { OrderSupplyDecision } from "../../domain/value-objects/order-supply.js";
import { sameDayDoorOf } from "../../../order-cutoffs/domain/same-day-doors.js";
import { ShelfCircuit } from "./shelf-circuit.service.js";
import type { PricingCaller } from "../../../pricing/application/pricing-caller.js";
import type { RevisedFrom } from "../../revision/application/services/revised-line-pricing.js";

export type { OrderContent } from "./order-content.js";

/**
 * **Ce que la porte permet** à la composition. Le client, l'invité et
 * l'équipe composent sous {@link PLACEMENT_POLICY} ; l'échéance d'un panier
 * récurrent sous {@link RECURRING_OCCURRENCE_POLICY} ; la transformation d'un
 * reliquat sous la politique que `backorderPolicyOf` construit avec son rejeu.
 * Aucune route ne la reçoit d'un corps : c'est le cas d'usage qui la choisit.
 */
export interface DraftPolicy {
  /** La dérogation d'heure limite de la société peut-elle être dépensée ? */
  readonly deadlineWaiver: "consider" | "ignore";
  /**
   * La surtaxe de retard que le verdict pose : appliquée, ou levée quel que
   * soit le verdict. Levée, la dérogation se dépense quand même — elle admet
   * la commande —, mais elle ne coûte rien au client.
   */
  readonly lateFee: "apply" | "waive";
  /**
   * Le port offert : le seuil du franco de la route vaut 0, donc toujours
   * atteint, et la commande porte le drapeau `delivery_offered` que la
   * révision relit. Le calcul reste celui de `priceBasket`.
   */
  readonly offeredDelivery: boolean;
  /**
   * Les lignes figées et les remises à rejouer à la place d'une composition
   * aux prix du jour — le chemin de la révision ; `null` : les prix du jour.
   */
  readonly replayed: RevisedFrom | null;
  /** Qui demande le créneau ; `null` : déduit des parties ({@link windowRequesterOf}). */
  readonly windowRequester: WindowRequester | null;
  /**
   * Les CGV que la commande fige à la place de celles en vigueur : celles que
   * le panier récurrent applique au jour de l'échéance (plan des paniers
   * récurrents, § 7). Absentes : la version en vigueur à la passation.
   */
  readonly salesTerms?: OrderSalesTerms;
}

/** La passation d'une personne : la dérogation se dépense, le créneau se juge. */
export const PLACEMENT_POLICY: DraftPolicy = {
  deadlineWaiver: "consider",
  lateFee: "apply",
  offeredDelivery: false,
  replayed: null,
  windowRequester: null,
};

/**
 * L'échéance d'un panier récurrent, passée sans personne devant l'écran :
 * aucune dérogation dépensée (donc aucun frais de retard), et le créneau du
 * panier honoré tel qu'il a été choisi ({@link SUBSCRIPTION_WINDOW}). La
 * passation y ajoute les CGV que le panier applique au jour servi.
 */
export const RECURRING_OCCURRENCE_POLICY: DraftPolicy = {
  deadlineWaiver: "ignore",
  lateFee: "apply",
  offeredDelivery: false,
  replayed: null,
  windowRequester: SUBSCRIPTION_WINDOW,
};

/**
 * Une commande composée, et ce qu'il a fallu pour qu'elle passe.
 *
 * `waiverUsed` n'est pas une information d'affichage : c'est une dette que
 * l'appelant doit solder après persistance, en consommant l'autorisation.
 */
export interface DraftedOrder {
  readonly order: Order;
  readonly waiverUsed: string | null;
  /**
   * Les limites d'article que l'équipe a passées : la passation exige un
   * motif puis les consigne dans la transaction de la commande ; l'estimation
   * les rend à l'écran. Vide pour tout autre appelant.
   */
  readonly exceeded: readonly ExceededItemLimit[];
}

/**
 * **Composer** une commande : ré-résoudre les prix au catalogue, résoudre
 * l'acheminement et ses ajustements, puis laisser l'agrégat calculer ses montants.
 *
 * Extrait des handlers parce qu'il y en a désormais deux — le client qui commande
 * pour lui-même, et l'équipe qui saisit pour un client. Ce qui les distingue est
 * le **mur** et la **décision de règlement**, jamais la façon de composer le
 * panier : une seconde implémentation aurait fini par appliquer une autre remise
 * de retrait, ou par oublier de déduire la zone du code postal — sur le chemin
 * qu'on teste le moins.
 *
 * Le calcul lui-même (prix, remise, frais, éligibilité, acheminement convenu)
 * vit depuis le 2026-10-23 dans {@link OrderComposition}, que la révision
 * d'une commande partage (voir `documentation/commandes/modification/modifier-une-commande.md`, § 2.2 « Le chemin d'une modification »). Ce
 * service garde ce qui n'appartient qu'à la PASSATION : le payeur, la journée
 * ouverte, l'heure limite et sa dérogation, la surtaxe, les CGV, la langue.
 * Il assemble ses deux collaborateurs à partir des mêmes ports qu'avant,
 * pour que son contrat d'injection ne change pas.
 *
 * Ce service ne décide **rien** : ni qui a le droit, ni comment on encaisse. Il
 * rend une commande dont le règlement n'est pas encore tranché, et `toPersistence`
 * refusera de la sérialiser tant qu'il ne l'est pas.
 */
@Injectable()
export class OrderDrafting {
  private readonly logger = new Logger(OrderDrafting.name);
  private readonly composition: OrderComposition;

  constructor(
    linePricing: OrderLinePricing,
    adjustments: CartAdjustments,
    deliveryDefaults: DeliveryDefaultsReader,
    private readonly deadline: OrderDeadline,
    private readonly clock: Clock,
    audiences: CustomerAudiences,
    operations: OrderOperations,
    private readonly payers: OrderPayerReader,
    deliveryVat: OrderDeliveryVatReader,
    private readonly plans: OrderPlanGate,
    private readonly salesTerms: OrderSalesTermsReader,
    classifications: OrderLineClassificationReader,
    private readonly shelf: ShelfCircuit,
  ) {
    this.composition = new OrderComposition(
      linePricing,
      adjustments,
      deliveryDefaults,
      operations,
      deliveryVat,
      classifications,
      audiences,
    );
  }

  /**
   * Compose la commande. Le règlement reste à décider par l'appelant.
   *
   * Rend **aussi** la dérogation retenue, s'il y en a une : l'appelant la
   * consomme dans la transaction qui écrit la commande. La rendre ici plutôt
   * que de consommer sur place : ce service compose, il n'écrit rien — une
   * commande qui échoue ensuite ne doit pas avoir brûlé l'autorisation.
   *
   * `voucher` : le bon de fidélité déjà lu par l'appelant, ou `null`. Seule la
   * passation du client connecté en porte un (plan des points, C3) ; ce
   * service ne le réserve pas — il le passe à l'agrégat, qui décide ce qu'il
   * impute.
   *
   * `requestedSupply` : la marque que l'écran de l'ÉQUIPE envoie (lot L4 du
   * circuit du jour J) ; ignorée pour un client, dont la marque se décide ici
   * ({@link ShelfCircuit.decide}).
   */
  async draft(
    parties: OrderParties,
    content: OrderContent,
    voucher: OrderVoucher | null,
    // La langue du CLIENT à la passation (lot A3) ; `null` pour la saisie du
    // staff et pour une boutique qui ne l'a pas envoyée.
    locale: OrderLocale | null,
    // Qui demande ce prix, pour la sonde (`pricing-caller.ts`) : la passation
    // se déclare `checkout`, l'estimation de la saisie `estimate` (lot P2).
    caller: PricingCaller,
    requestedSupply?: StaffOrderSupply,
    // Le « Retrait immédiat » que l'écran de l'équipe déclare (lot L6).
    requestedShortcut?: StaffEntryShortcut,
    // D'où vient la saisie de l'équipe (Hugo, 2026-11-04) ; `null` pour le client.
    entryOrigin: OrderEntryOrigin | null = null,
    policy: DraftPolicy = PLACEMENT_POLICY,
  ): Promise<DraftedOrder> {
    // 🔴 Le payeur se décide ICI, et en premier : c'est le seul chemin que les
    // trois portes de passation partagent (client, saisie staff, boutique), et
    // un refus — payeur suspendu, compte de groupe — ne doit rien coûter de
    // plus que cette lecture (sous-comptes §2.3, §2.4).
    const standing = await this.standingOf(parties.companyId);
    const billedCompanyId = orderPayerOf(standing);
    // Un de nos restaurants : la commande naît interne, sur la même lecture du
    // payeur. L'agrégat en calcule la ligne « offert » et le total nul.
    const offer = offerFor(orderPayerInHouseOf(standing), parties.offer);
    // Le principal se copie sur la MÊME lecture que le payeur : aucun
    // historique des rattachements ne permettrait de le retrouver ensuite
    // (avis au principal, §2).
    const principal = orderPrincipalOf(standing);
    // D'où vient la marchandise — décidé par le serveur (circuit du jour J,
    // §11.1) : les gardes de la journée s'y séparent.
    const supply = await this.shelf.decide(
      parties,
      content.requestedDeliveryDate,
      requestedSupply,
      requestedShortcut,
    );
    // L'arrêt du plan ferme la journée au CLIENT, heure limite ou pas (lot O3) :
    // refusé ici, tôt et sans verrou ; `holdSupply` le reprend sous verrou. La
    // saisie de l'équipe passe, et sera reçue « hors plan » (§8.3). Une
    // commande sur stock n'entre jamais au plan : elle n'a pas à l'attendre.
    if (supply.supply === "planned") {
      await this.ensureDayOpen(content.requestedDeliveryDate, parties);
    }
    // Le chargement (§ 2.4, étape 4) : ses refus de lecture se lèvent ici.
    const vatMethod = placementVatMethodOf(parties.companyId);
    const loaded = await this.composition.load({
      content,
      parties,
      revised: policy.replayed,
      caller,
      vatMethod,
      frozenDeliveryVatMode: null,
      frozenAudience: null,
      frozenDeliveryFee: null,
      offeredDelivery: policy.offeredDelivery,
      negotiated: { payerCompanyId: billedCompanyId, day: content.requestedDeliveryDate },
    });
    // APRÈS le chargement : un panier qu'on ne sait pas charger est refusé pour
    // ce qu'il est (un article inconnu, indisponible) avant de l'être pour
    // l'heure. Le coût est de tarifer un panier qu'on refusera ensuite.
    const admission = await this.ensureCircuit(
      supply,
      content,
      parties,
      pickupSiteOf(loaded.context),
      policy,
    );
    // APRÈS le délai de fabrication, et sans la dérogation (D6 du plan des
    // opérations datées) : c'est le premier geste d'`arrange`.
    const arranged = await this.composition.arrange(
      content,
      parties,
      loaded.context,
      policy.windowRequester ??
        windowRequesterOf(parties.companyId, parties.placedByStaffId !== null),
      this.clock.now(),
    );
    // C'est un VERDICT qui a un prix (§ 2.3) : `priceBasket` l'applique au
    // sous-total ; le devis d'une société le prévoit par la même source.
    const composed = OrderComposition.draftOf(content, loaded.context, arranged, {
      lateFee: policy.lateFee === "waive" ? null : admission.lateFee,
    });
    const order = Order.draft(
      {
        ...composed,
        companyId: parties.companyId,
        billedCompanyId,
        principal,
        placedByUserId: parties.placedByUserId,
        placedByStaffId: parties.placedByStaffId,
        buyerKind: parties.buyerKind,
        // 🔴 Plus d'estampille de version (Q2, Hugo, 2026-10-17 — plan
        // documentation/catalogue/catalogue-synchronise.md §6, X0). Les lignes
        // portent leur snapshot (prix, nom, TVA) ; la colonne reste en base et
        // les commandes passées gardent la leur.
        catalogVersionId: null,
        voucher,
        salesTerms: policy.salesTerms ?? (await this.salesTermsIn(salesTermsOf(loaded.audience))),
        locale,
        ...(offer === undefined ? {} : { offer }),
      },
      supply,
      entryOrigin,
    );
    if (policy.offeredDelivery) {
      order.offerDelivery();
    }
    // Sur LE chiffrage de l'agrégat : il n'est plus refait ici (L7, 2026-11-04).
    warnBeyondCap(this.logger, order.pricingNotes());
    return { order, waiverUsed: admission.waiverUsed, exceeded: admission.exceeded };
  }

  /**
   * Le premier jour qu'on peut demander, selon les réglages seuls (§8.3) : le
   * plan arrêté refuse le client ; le réglage « jour même » refuse aujourd'hui
   * à tous — sauf à l'équipe sur un plan arrêté, qui reçoit « hors plan » : la
   * marchandise est déjà en fabrication, et le retirage décidera.
   */
  private async ensureDayOpen(day: string | null, parties: OrderParties): Promise<void> {
    const closed = await this.plans.isClosed(day);
    if (closed && parties.placedByStaffId === null) {
      throw new ProductionPlanClosedError(day ?? "");
    }
    if (!closed) {
      await this.plans.ensureNotTooSoon(
        day,
        sameDayDoorOf(parties.companyId, parties.placedByStaffId !== null),
        this.clock.now(),
      );
    }
  }

  /**
   * Les gardes qui suivent la résolution, séparées sur la marque (§11.1) :
   * une commande fabriquée oppose l'heure limite (et sa dérogation) ; une
   * commande sur stock n'en a pas — sa clientèle et les créneaux restants de
   * son point la limitent à la place. Rend ce que la commande doit à son
   * retard : la dérogation à dépenser et son prix.
   */
  private async ensureCircuit(
    supply: OrderSupplyDecision,
    content: OrderContent,
    parties: OrderParties,
    siteId: string | null,
    policy: DraftPolicy,
  ): Promise<DeadlineAdmission> {
    if (supply.supply === "planned") {
      return this.ensureNotTooLate(content, parties, policy);
    }
    await this.shelf.ensureOpen(parties, siteId);
    return NOTHING_OWED;
  }

  /**
   * **Ce que la commande qu'on écrit tient** — à appeler en PREMIER dans la
   * transaction qui la persiste, avant le bon et toute ligne `orders` (plan
   * `plan-reglages-commandes.md`, §8.1, S5 ; plan du jour J, §11.2, §12).
   *
   * - **Sur stock** : le verrou de la vitrine de son point, et le reste relu
   *   dessous ({@link ShelfCircuit.hold}). Jamais le verrou de la journée.
   * - **Fabriquée** : le verrou de la journée, qui tient jusqu'au `COMMIT` :
   *   l'arrêt du plan attend, ou la commande est refusée. Plan arrêté : la
   *   saisie de l'équipe est reçue « hors plan », le client refusé — c'est
   *   l'agrégat qui tranche (`Order.receiveOffPlan`, §8.3).
   *
   * @throws {ShelfStockShortError} sur stock : le reste ne couvre plus le panier.
   * @throws {ProductionPlanClosedError} fabriquée : le plan a été arrêté depuis `draft`, pour un client.
   */
  async holdSupply(order: Order, requestedDeliveryDate: string | null): Promise<void> {
    if (await this.shelf.hold(order)) {
      return;
    }
    if (requestedDeliveryDate !== null && (await this.plans.hold(requestedDeliveryDate))) {
      order.receiveOffPlan(requestedDeliveryDate);
    }
  }

  /**
   * Oppose l'heure limite de commande, s'il y en a une à opposer : le verdict
   * du délai de commande, appliqué par la passation — avec la dérogation de la
   * société et son prix, quand la politique de la porte permet de la dépenser
   * (jamais pour l'échéance d'un panier récurrent).
   *
   * La limite d'un article se lit en clientèle `pro` : la saisie par l'équipe
   * exige une société (cf. `place-order-for-customer`), et c'est la lecture
   * que toutes les passations font aujourd'hui.
   *
   * `requestedDeliveryDate` est obligatoire au contrat (`orderPayloadSchema`) ;
   * la garde typée couvre les appelants internes, pas une entrée HTTP.
   */
  private async ensureNotTooLate(
    content: OrderContent,
    parties: OrderParties,
    policy: DraftPolicy,
  ): Promise<DeadlineAdmission> {
    const day = content.requestedDeliveryDate;
    if (day === null) {
      return NOTHING_OWED;
    }
    const verdict = await this.deadline.verdict({
      skus: content.lines.map((line) => line.sku),
      serviceDay: day,
      // La passation juge à l'horloge (plan S2, R6).
      at: this.clock.now(),
      asker: {
        audience: "pro",
        companyId: parties.companyId,
        waiver: policy.deadlineWaiver,
        exceedItemLimits: parties.exceedItemLimits,
        // La saisie : la règle générale est opposée, un dépassement ne la franchit pas.
        itemLimitFloor: "general_rule_open",
      },
    });
    return admitWithinDeadline(verdict, day);
  }

  /** La société qui commande, lue à l'instant de la passation — `null` sans société. */
  private async standingOf(companyId: string | null): Promise<OrderPayerStanding | null> {
    if (companyId === null) {
      return null;
    }
    return this.payers.standingAt(companyId, this.clock.now());
  }

  /** Les CGV de ce texte en vigueur maintenant, prêtes à figer. */
  private async salesTermsIn(document: SalesTermsDocument): Promise<OrderSalesTerms> {
    return { document, ...(await this.salesTerms.inForce(document)) };
  }
}

/**
 * **L'offre que la commande porte** : celle d'une commande interne quand le
 * payeur est un de nos restaurants — elle remplace toute autre, car rien ne
 * se facture à un restaurant maison —, sinon celle que l'équipe a posée.
 * Le régime vaut pour les commandes passées après le marquage : il est lu
 * à chaque composition, jamais copié sur la société.
 */
function offerFor(
  payerInHouse: boolean,
  requested: OrderOfferReason | undefined,
): OrderOfferReason | undefined {
  return payerInHouse ? IN_HOUSE_ORDER_REASON : requested;
}
