import {
  cartAdjustmentCents,
  type LateFeeAdjustment,
  type OrderLineInput as OrderLineRequest,
  type SalesTermsDocument,
} from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { CartAdjustments } from "./cart-adjustments.service.js";
import { CustomerAudiences } from "./customer-audiences.service.js";
import { DeliveryDefaultsReader } from "../../domain/ports/delivery-defaults.reader.js";
import type { WindowRequester } from "../../domain/services/delivery-window.js";
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
import { ProductCatalogReader } from "../../../catalog/domain/ports/product-catalog.reader.js";
import { SaleReferenceIntake } from "../../../catalog/application/sale-reference-intake.service.js";
import { Clock } from "../../../../platform/time/clock.js";
import { OrderComposition } from "./order-composition.service.js";
import type { OrderContent } from "./order-content.js";
import { OrderCutoffGate } from "./order-cutoff-gate.service.js";
import { OrderOperations } from "./order-operations.service.js";
import { OrderPlanGate } from "./order-plan-gate.service.js";
import { OrderLinePricing, type ResolvedOrderLine } from "./order-line-pricing.service.js";
import type { OrderParties } from "./order-parties.js";
import type { OrderLocale } from "../../domain/value-objects/order-locale.js";
import { placementVatMethodOf } from "../../domain/value-objects/order-vat-method.js";

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
  private readonly composition: OrderComposition;
  private readonly cutoffGate: OrderCutoffGate;

  constructor(
    private readonly linePricing: OrderLinePricing,
    adjustments: CartAdjustments,
    deliveryDefaults: DeliveryDefaultsReader,
    cutoffs: OrderCutoffReader,
    private readonly clock: Clock,
    catalog: ProductCatalogReader,
    waivers: OrderCutoffWaiverGate,
    private readonly lateFees: OrderLateFeeReader,
    audiences: CustomerAudiences,
    private readonly operations: OrderOperations,
    private readonly payers: OrderPayerReader,
    deliveryVat: OrderDeliveryVatReader,
    private readonly plans: OrderPlanGate,
    private readonly salesTerms: OrderSalesTermsReader,
    classifications: OrderLineClassificationReader,
    private readonly intake: SaleReferenceIntake,
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
   */
  async draft(
    parties: OrderParties,
    received: OrderContent,
    voucher: OrderVoucher | null,
    // La langue du CLIENT à la passation (lot A3) ; `null` pour la saisie du
    // staff et pour une boutique qui ne l'a pas envoyée.
    locale: OrderLocale | null,
  ): Promise<DraftedOrder> {
    // Les anciennes références d'abord : tout ce qui suit — heure limite,
    // opérations, prix, ligne écrite — ne voit que l'article désigné
    // (`plan-defaut-sous-sa-reference.md`, § 5). Après la clé d'idempotence,
    // qui reste prise sur ce que le client a envoyé : un rejeu se reconnaît.
    const content: OrderContent = {
      ...received,
      lines: await this.intake.normalized(received.lines, "order"),
    };
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
    // L'arrêt du plan ferme la journée au CLIENT, heure limite ou pas (lot O3) :
    // refusé ici, tôt et sans verrou ; `holdPlan` le reprend sous verrou. La
    // saisie de l'équipe passe, et sera reçue « hors plan » (§8.3).
    await this.ensureDayOpen(content.requestedDeliveryDate, parties);
    const resolved = await this.composition.resolve(content, parties, null);
    // APRÈS la résolution, et l'ordre est un choix : la règle qui s'applique est
    // celle du point EFFECTIVEMENT retenu, qu'on ne connaît qu'ici. Le coût est
    // de tarifer un panier qu'on refusera ensuite ; le prix de l'inverse serait
    // d'opposer la mauvaise règle, ce qui est un refus faux.
    const waiverUsed = await this.ensureNotTooLate(content, parties);
    // APRÈS le délai de fabrication, et sans la dérogation (D6 du plan des
    // opérations datées) : c'est le premier geste d'`arrange`.
    const arranged = await this.composition.arrange(
      content,
      parties,
      resolved,
      windowRequesterOf(parties),
    );
    // La surtaxe ne se lit QUE si une dérogation a servi : une requête de plus
    // sur chaque commande, pour un réglage que la plupart des maisons n'ont pas,
    // se paierait sur toutes les commandes à l'heure.
    const late = await this.lateFeeFor(waiverUsed, resolved.subtotalCents);
    const order = Order.draft({
      // La méthode de la PASSATION — celle qu'`Order.draft` décidera de son
      // côté sur la même société : les montants partent dans son unité.
      ...OrderComposition.draftOf(
        content,
        resolved,
        arranged,
        placementVatMethodOf(parties.companyId),
      ),
      companyId: parties.companyId,
      billedCompanyId,
      principal,
      placedByUserId: parties.placedByUserId,
      placedByStaffId: parties.placedByStaffId,
      // 🔴 Plus d'estampille de version (Q2, Hugo, 2026-10-17 — plan
      // documentation/catalogue/catalogue-synchronise.md §6, X0). Les lignes
      // portent leur snapshot (prix, nom, TVA) ; la colonne reste en base et
      // les commandes passées gardent la leur.
      catalogVersionId: null,
      // La surtaxe ne s'applique QUE si une dérogation a laissé passer : c'est
      // elle qui atteste le retard. Sans réglage, elle vaut zéro.
      lateFeeCents: late.cents,
      lateFeeAdjustment: late.frozen,
      voucher,
      salesTerms: await this.salesTermsIn(salesTermsOf(resolved.audience)),
      locale,
    });
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
      await this.plans.ensureNotTooSoon(day);
    }
  }

  /**
   * **La journée tenue pour la commande qu'on écrit** — à appeler en PREMIER
   * dans la transaction qui la persiste, avant toute ligne `orders` (plan
   * `plan-reglages-commandes.md`, §8.1, S5). Le verrou de la journée tient
   * jusqu'au `COMMIT` : l'arrêt du plan attend, ou la commande est refusée.
   *
   * Plan arrêté : la saisie de l'équipe est reçue « hors plan », le client
   * refusé — c'est l'agrégat qui tranche (`Order.receiveOffPlan`, §8.3).
   *
   * @throws {ProductionPlanClosedError} le plan a été arrêté depuis `draft`, pour un client.
   */
  async holdPlan(order: Order, requestedDeliveryDate: string | null): Promise<void> {
    if (requestedDeliveryDate !== null && (await this.plans.hold(requestedDeliveryDate))) {
      order.receiveOffPlan(requestedDeliveryDate);
    }
  }

  /**
   * **Ce que la commande coûterait, sans la passer.**
   *
   * Le panier du staff affichait le tarif du CATALOGUE pendant que cette
   * méthode-ci facturait le prix RÉSOLU : un commercial annonçait au téléphone
   * un prix que la commande contredisait ensuite.
   *
   * Elle réutilise la résolution qui facture, et n'ajoute rien : une seconde
   * arithmétique d'estimation aurait fini par diverger de la première. Elle
   * s'arrête au sous-total HT, parce que remise de retrait, frais de zone et
   * TVA dépendent d'un acheminement qu'une estimation ne connaît pas.
   */
  async quote(
    parties: OrderParties,
    lines: readonly OrderLineRequest[],
  ): Promise<ResolvedOrderLine[]> {
    const explained = await this.linePricing.explain(lines, parties, "cart");
    // Sans jour : le devis ne juge pas la date, mais il dit déjà qu'une bûche
    // n'est pas encore ouverte, close ou introuvable — le refus n'attend pas
    // le paiement (D6).
    await this.operations.ensure(lines, parties.companyId);
    return explained;
  }

  /**
   * Ce que le retard coûte, **et seulement quand il y a eu retard**.
   *
   * `null` de dérogation ⇒ rien à facturer. Réglage absent ⇒ rien non plus :
   * rattraper sans facturer est un choix valable, et inventer un montant
   * facturerait une décision que personne n'a prise. Le taux voyage avec le
   * montant : un montant sans son taux ne se justifie pas devant un comptable.
   */
  private async lateFeeFor(
    waiverUsed: string | null,
    subtotalCents: number,
  ): Promise<{ cents: number; frozen: LateFeeAdjustment | null }> {
    if (waiverUsed === null) {
      return { cents: 0, frozen: null };
    }
    const setting = await this.lateFees.current();
    if (setting === null) {
      return { cents: 0, frozen: null };
    }
    return {
      cents: cartAdjustmentCents(setting.adjustment, subtotalCents),
      frozen: { adjustment: setting.adjustment, vatRatePercent: setting.vatRatePercent },
    };
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
      { withWaiver: true },
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

/**
 * Le pro ne demande qu'une fenêtre inscrite ; la saisie staff et le
 * particulier restent libres de l'heure (2026-10-12, à trancher par Hugo).
 */
export function windowRequesterOf(parties: OrderParties): WindowRequester {
  if (parties.placedByStaffId !== null) {
    return "staff";
  }
  return parties.companyId === null ? "individual" : "pro";
}
