import {
  type SalesTermsDocument,
  type StaffEntryShortcut,
  type StaffOrderSupply,
} from "@lfd/contracts";
import { Injectable, Logger } from "@nestjs/common";

import { CartAdjustments } from "./cart-adjustments.service.js";
import { CustomerAudiences } from "./customer-audiences.service.js";
import { DeliveryDefaultsReader } from "../../domain/ports/delivery-defaults.reader.js";
import { windowRequesterOf } from "../../domain/services/delivery-window.js";
import { Order, type OrderSalesTerms, type OrderVoucher } from "../../domain/entities/order.js";
import { ProductionPlanClosedError } from "../../domain/errors/production-plan-closed.error.js";
import { OrderCutoffReader } from "../../domain/ports/order-cutoff.reader.js";
import { OrderCutoffWaiverGate } from "../../domain/ports/order-cutoff-waiver.gate.js";
import { OrderDeliveryVatReader } from "../../domain/ports/order-delivery-vat.reader.js";
import { OrderLateFeeReader } from "../../domain/ports/order-late-fee.reader.js";
import { OrderLineClassificationReader } from "../../domain/ports/order-line-classification.reader.js";
import {
  OrderPayerReader,
  type OrderPayerStanding,
} from "../../domain/ports/order-payer.reader.js";
import { OrderSalesTermsReader } from "../../domain/ports/order-sales-terms.reader.js";
import { salesTermsOf } from "../../domain/services/sales-terms-of.js";
import { orderPayerOf } from "../../domain/services/order-payer.js";
import { orderPrincipalOf } from "../../domain/services/order-principal.js";
import type { OrderEntryOrigin } from "../../domain/value-objects/order-supply.js";
import { ProductCatalogReader } from "../../../catalog/domain/ports/product-catalog.reader.js";
import { Clock } from "../../../../platform/time/clock.js";
import { warnBeyondCap } from "./basket-promotions.service.js";
import { OrderComposition, pickupSiteOf } from "./order-composition.service.js";
import type { OrderContent } from "./order-content.js";
import { OrderCutoffGate } from "./order-cutoff-gate.service.js";
import { LateFeeJudgement } from "./late-fee-judgement.service.js";
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

export type { OrderContent } from "./order-content.js";

/**
 * Une commande composée, et ce qu'il a fallu pour qu'elle passe.
 *
 * `waiverUsed` n'est pas une information d'affichage : c'est une dette que
 * l'appelant doit solder après persistance, en consommant l'autorisation.
 */
export interface DraftedOrder {
  readonly order: Order;
  readonly waiverUsed: string | null;
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
 * d'une commande partage (plan `plan-modifier-une-commande.md`, M1). Ce
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
  private readonly cutoffGate: OrderCutoffGate;
  private readonly lateFee: LateFeeJudgement;

  constructor(
    linePricing: OrderLinePricing,
    adjustments: CartAdjustments,
    deliveryDefaults: DeliveryDefaultsReader,
    cutoffs: OrderCutoffReader,
    private readonly clock: Clock,
    catalog: ProductCatalogReader,
    waivers: OrderCutoffWaiverGate,
    lateFees: OrderLateFeeReader,
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
    this.cutoffGate = new OrderCutoffGate(cutoffs, catalog, waivers, clock);
    this.lateFee = new LateFeeJudgement(this.cutoffGate, shelf, lateFees);
  }

  /**
   * Compose la commande. Le règlement reste à décider par l'appelant.
   *
   * Rend **aussi** la dérogation dépensée, s'il y en a eu une : l'appelant doit
   * la consommer APRÈS avoir persisté la commande. La rendre ici plutôt que de
   * consommer sur place n'est pas de la timidité — consommer une autorisation
   * pour une commande qui échoue ensuite la brûlerait, et le client devrait
   * rappeler pour en obtenir une seconde qu'il avait déjà.
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
  ): Promise<DraftedOrder> {
    // 🔴 Le payeur se décide ICI, et en premier : c'est le seul chemin que les
    // trois portes de passation partagent (client, saisie staff, boutique), et
    // un refus — payeur suspendu, compte de groupe — ne doit rien coûter de
    // plus que cette lecture (sous-comptes §2.3, §2.4).
    const standing = await this.standingOf(parties.companyId);
    const billedCompanyId = orderPayerOf(standing);
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
      revised: null,
      caller,
      vatMethod,
      frozenDeliveryVatMode: null,
      frozenAudience: null,
      frozenDeliveryFee: null,
    });
    // APRÈS la résolution, et l'ordre est un choix : la règle qui s'applique est
    // celle du point EFFECTIVEMENT retenu, qu'on ne connaît qu'ici. Le coût est
    // de tarifer un panier qu'on refusera ensuite ; le prix de l'inverse serait
    // d'opposer la mauvaise règle, ce qui est un refus faux.
    const waiverUsed = await this.ensureCircuit(
      supply,
      content,
      parties,
      pickupSiteOf(loaded.context),
    );
    // APRÈS le délai de fabrication, et sans la dérogation (D6 du plan des
    // opérations datées) : c'est le premier geste d'`arrange`.
    const arranged = await this.composition.arrange(
      content,
      parties,
      loaded.context,
      windowRequesterOf(parties.companyId, parties.placedByStaffId !== null),
      this.clock.now(),
    );
    // C'est un VERDICT qui a un prix (§ 2.3) : `priceBasket` l'applique au
    // sous-total ; le devis d'une société le prévoit par la même source.
    const composed = OrderComposition.draftOf(content, loaded.context, arranged, {
      lateFee: await this.lateFee.forWaiver(waiverUsed),
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
        salesTerms: await this.salesTermsIn(salesTermsOf(loaded.audience)),
        locale,
      },
      supply,
      entryOrigin,
    );
    // Sur LE chiffrage de l'agrégat : il n'est plus refait ici (L7, 2026-11-04).
    warnBeyondCap(this.logger, order.pricingNotes());
    return { order, waiverUsed };
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
   * son point la limitent à la place. Rend la dérogation dépensée, ou `null`.
   */
  private async ensureCircuit(
    supply: OrderSupplyDecision,
    content: OrderContent,
    parties: OrderParties,
    siteId: string | null,
  ): Promise<string | null> {
    if (supply.supply === "planned") {
      return this.ensureNotTooLate(content, parties);
    }
    await this.shelf.ensureOpen(parties, siteId);
    return null;
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
   * Oppose l'heure limite de commande, s'il y en a une à opposer — avec la
   * dérogation du client (cf. {@link OrderCutoffGate}).
   *
   * `requestedDeliveryDate` est obligatoire au contrat (`orderPayloadSchema`) ;
   * la garde typée couvre les appelants internes, pas une entrée HTTP.
   */
  private async ensureNotTooLate(
    content: OrderContent,
    parties: OrderParties,
  ): Promise<string | null> {
    if (content.requestedDeliveryDate === null) {
      return null;
    }
    return this.cutoffGate.ensure(
      content.lines.map((line) => line.sku),
      content.requestedDeliveryDate,
      parties.companyId,
      // La passation juge à l'horloge (plan S2, R6).
      { withWaiver: true, at: this.clock.now() },
    );
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
