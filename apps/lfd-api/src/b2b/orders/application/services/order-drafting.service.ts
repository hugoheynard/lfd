import {
  cartAdjustmentCents,
  type BillingAddressPayload,
  type CartAdjustment,
  type FulfillmentMethod,
  type LateFeeAdjustment,
  type OrderLineInput as OrderLineRequest,
  type PickupAddressView,
} from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { CatalogVersionReader } from "../../../catalog/domain/ports/catalog-version.reader.js";
import { CartAdjustments } from "./cart-adjustments.service.js";
import { type DeliveryContact, type FulfillmentWindow } from "@lfd/contracts";
import {
  DeliveryDefaultsReader,
  NO_DELIVERY_DEFAULTS,
} from "../../domain/ports/delivery-defaults.reader.js";
import {
  agreeFulfillment,
  type FulfillmentDefaults,
  windowFitsPickup,
} from "../../domain/services/agreed-fulfillment.js";
import { Order } from "../../domain/entities/order.js";
import {
  InvalidOrderFulfillmentError,
  PickupClosedAtRequestedTimeError,
} from "../../domain/errors/order-errors.js";
import { OrderCutoffReader } from "../../domain/ports/order-cutoff.reader.js";
import { OrderCutoffWaiverGate } from "../../domain/ports/order-cutoff-waiver.gate.js";
import { OrderLateFeeReader } from "../../domain/ports/order-late-fee.reader.js";
import { ProductCatalogReader } from "../../domain/ports/product-catalog.reader.js";
import { ensureWithinOrderCutoff } from "../../domain/services/order-cutoff-guard.js";
import { Clock } from "../../../../platform/time/clock.js";
import { OrderLinePricing, type ResolvedOrderLine } from "./order-line-pricing.service.js";
import type { OrderParties } from "./order-parties.js";
import { lineTotalCents } from "@lfd/money";

/** Ce qu'un panier demande, quelle que soit la porte par laquelle il arrive. */
export interface OrderContent {
  readonly fulfillmentMethod: FulfillmentMethod;
  readonly deliveryAddress: BillingAddressPayload | null;
  /** L'adresse du carnet dont elle vient, ou `null` si dictée à la volée. */
  readonly deliveryAddressId: string | null;
  readonly pickupAddressId: string | null;
  readonly requestedDeliveryDate: string | null;
  /**
   * La tranche demandée — engagement, pas préférence. `undefined` = l'écran ne
   * se prononce pas, le réglage du client s'applique (cf. `agreeFulfillment`).
   */
  readonly requestedWindow?: FulfillmentWindow | null | undefined;
  /** Qui reçoit, tel que l'écran l'affiche. `undefined` = prendre le réglage. */
  readonly deliveryContact?: DeliveryContact | null | undefined;
  readonly signatureRequired?: boolean | undefined;
  readonly note: string;
  readonly lines: readonly OrderLineRequest[];
}

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

/** Acheminement résolu : les snapshots à figer et les deux ajustements de prix. */
interface ResolvedFulfillment {
  /**
   * Le point de retrait **effectivement** retenu, ou `null` en coursier.
   *
   * Distinct de `content.pickupAddressId`, qui peut être nul en retrait quand le
   * client n'a rien choisi : c'est alors le point par défaut qui sert, et c'est
   * SA règle d'heure limite qui s'applique. Opposer celle du défaut plateforme
   * refuserait — ou laisserait passer — au nom d'un point qui ne remet rien.
   */
  readonly pickupAddressId: string | null;
  readonly deliveryZoneId: string | null;
  readonly deliveryAddress: BillingAddressPayload | null;
  readonly pickupAddress: BillingAddressPayload | null;
  readonly discountCents: number;
  /** L'ajustement figé qui l'a produite (taux/montant du point), ou `null`. */
  readonly discountAdjustment: CartAdjustment | null;
  /** Le barème de zone qui a produit les frais, ou `null` en retrait. */
  readonly deliveryFeeAdjustment: CartAdjustment | null;
  readonly deliveryFeeCents: number;
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
 * Ce service ne décide **rien** : ni qui a le droit, ni comment on encaisse. Il
 * rend une commande dont le règlement n'est pas encore tranché, et `toPersistence`
 * refusera de la sérialiser tant qu'il ne l'est pas.
 */
@Injectable()
export class OrderDrafting {
  constructor(
    private readonly linePricing: OrderLinePricing,
    private readonly catalogVersions: CatalogVersionReader,
    private readonly adjustments: CartAdjustments,
    private readonly deliveryDefaults: DeliveryDefaultsReader,
    private readonly cutoffs: OrderCutoffReader,
    private readonly clock: Clock,
    private readonly catalog: ProductCatalogReader,
    private readonly waivers: OrderCutoffWaiverGate,
    private readonly lateFees: OrderLateFeeReader,
  ) {}

  /**
   * Compose la commande. Le règlement reste à décider par l'appelant.
   *
   * Rend **aussi** la dérogation dépensée, s'il y en a eu une : l'appelant doit
   * la consommer APRÈS avoir persisté la commande. La rendre ici plutôt que de
   * consommer sur place n'est pas de la timidité — consommer une autorisation
   * pour une commande qui échoue ensuite la brûlerait, et le client devrait
   * rappeler pour en obtenir une seconde qu'il avait déjà.
   */
  async draft(parties: OrderParties, content: OrderContent): Promise<DraftedOrder> {
    // Lue AVANT la résolution, et l'ordre est un choix. Une validation qui
    // tomberait pile entre les deux ne peut alors que rendre l'estampille
    // ANCIENNE de ce que les lignes portent — jamais l'inverse. Une estampille
    // en retard sous-entend « au moins cette version-là » ; une estampille en
    // avance affirmerait que la ligne vient d'une livraison qu'elle n'a pas vue.
    // La seconde est un mensonge, la première une borne.
    const catalogVersionId = await this.catalogVersions.currentId();
    const resolved = await this.linePricing.resolve(content.lines, parties);
    const lines = resolved.map((entry) => entry.line);
    // Le sous-total est un MONTANT : arrondi au centime, une fois par ligne,
    // par la même fonction que la ligne persistée. Deux arithmétiques ici
    // feraient diverger le seuil de franco du total facturé — sur un centime,
    // et seulement pour certains paniers.
    const subtotalCents = lines.reduce(
      (sum, line) => sum + lineTotalCents(line.unitPriceMillicents, line.quantity),
      0,
    );
    const acheminement = await this.resolveFulfillment(content, subtotalCents);
    // APRÈS la résolution, et l'ordre est un choix : la règle qui s'applique est
    // celle du point EFFECTIVEMENT retenu, qu'on ne connaît qu'ici. Le coût est
    // de tarifer un panier qu'on refusera ensuite ; le prix de l'inverse serait
    // d'opposer la mauvaise règle, ce qui est un refus faux.
    const waiverUsed = await this.ensureNotTooLate(content, acheminement, parties);
    // La surtaxe ne se lit QUE si une dérogation a servi : une requête de plus
    // sur chaque commande, pour un réglage que la plupart des maisons n'ont pas,
    // se paierait sur toutes les commandes à l'heure.
    const late = await this.lateFeeFor(waiverUsed, subtotalCents);
    const agreed = agreeFulfillment(
      {
        window: content.requestedWindow,
        contact: content.deliveryContact,
        signatureRequired: content.signatureRequired,
      },
      await this.defaultsFor(content),
    );
    const order = Order.draft({
      agreed,
      companyId: parties.companyId,
      placedByUserId: parties.placedByUserId,
      placedByStaffId: parties.placedByStaffId,
      fulfillment: {
        method: content.fulfillmentMethod,
        deliveryZoneId: acheminement.deliveryZoneId,
        deliveryAddress: acheminement.deliveryAddress,
        pickupAddress: acheminement.pickupAddress,
      },
      requestedDeliveryDate: content.requestedDeliveryDate
        ? new Date(content.requestedDeliveryDate)
        : null,
      note: content.note,
      catalogVersionId,
      lines,
      discountCents: acheminement.discountCents,
      discountAdjustment: acheminement.discountAdjustment,
      deliveryFeeAdjustment: acheminement.deliveryFeeAdjustment,
      deliveryFeeCents: acheminement.deliveryFeeCents,
      // La surtaxe ne s'applique QUE si une dérogation a laissé passer : c'est
      // elle qui atteste le retard, et une commande à l'heure n'a rien à
      // rattraper. Sans réglage, elle vaut zéro — rattraper sans facturer est un
      // choix valable.
      lateFeeCents: late.cents,
      lateFeeAdjustment: late.frozen,
    });
    return { order, waiverUsed };
  }

  /**
   * **Ce que la commande coûterait, sans la passer.**
   *
   * Le panier du staff affichait le tarif du CATALOGUE pendant que cette
   * méthode-ci facturait le prix RÉSOLU : un commercial annonçait au téléphone
   * un prix que la commande contredisait ensuite.
   *
   * Elle réutilise `resolveLines`, **la résolution qui facture**, et n'ajoute
   * rien : une seconde arithmétique d'estimation aurait fini par diverger de la
   * première, et l'écart se serait découvert devant le client. Elle s'arrête au
   * sous-total HT, parce que remise de retrait, frais de zone et TVA dépendent
   * d'un acheminement qu'une estimation ne connaît pas — les inventer donnerait
   * un total que la validation contredirait.
   */
  async quote(
    parties: OrderParties,
    lines: readonly OrderLineRequest[],
  ): Promise<ResolvedOrderLine[]> {
    return this.linePricing.explain(lines, parties);
  }

  /**
   * Ce que le retard coûte, **et seulement quand il y a eu retard**.
   *
   * `null` de dérogation ⇒ rien à facturer. Réglage absent ⇒ rien non plus :
   * rattraper sans facturer est un choix valable, et inventer un montant
   * facturerait une décision que personne n'a prise.
   *
   * Le taux voyage avec le montant. Un montant sans son taux ne se justifie pas
   * devant un comptable, et il ne se recalcule pas — le réglage aura changé.
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
   * Oppose l'heure limite de commande, s'il y en a une à opposer.
   *
   * **Deux sources.** Chaque article peut porter la sienne, résolue par le
   * référentiel sur son échelle ; celui qui n'en a pas retombe sur la règle du
   * commerce. La garde arbitre : elle prend la décision la plus fermée parmi les
   * lignes, parce qu'un panier ne se découpe pas.
   *
   * Les deux lectures ne se font que lorsqu'il y a une date à juger. Le
   * catalogue est relu ici plutôt que repris de la résolution de prix : celle-ci
   * rend des lignes tarifées, pas les articles, et lui faire porter la limite
   * mêlerait deux sujets sur le chemin qui facture. Une lecture par clé primaire
   * sur les SKU du panier est le bon prix pour cette séparation.
   *
   * `requestedDeliveryDate` est obligatoire au contrat (`orderPayloadSchema`) ;
   * la garde typée couvre les appelants internes, pas une entrée HTTP.
   */
  private async ensureNotTooLate(
    content: OrderContent,
    acheminement: ResolvedFulfillment,
    parties: OrderParties,
  ): Promise<string | null> {
    if (content.requestedDeliveryDate === null) {
      return null;
    }
    const skus = content.lines.map((line) => line.sku);
    const [fallback, items, waiver] = await Promise.all([
      this.cutoffs.list(),
      this.catalog.resolveMany(skus),
      // Une commande sans entreprise n'a pas de dérogation possible : elle
      // n'appartient à personne à qui on aurait pu en accorder une.
      parties.companyId === null
        ? Promise.resolve(null)
        : this.waivers.openFor(parties.companyId, content.requestedDeliveryDate),
    ]);
    return ensureWithinOrderCutoff({
      // Un SKU absent du catalogue n'a pas de limite propre : il retombe sur la
      // règle du commerce. Il sera refusé plus loin pour ce qu'il est — inconnu
      // —, et pas ici pour une heure.
      lines: skus.map((sku) => ({ sku, limit: items.get(sku)?.orderTimeLimit ?? null })),
      fallback,
      pickupAddressId: acheminement.pickupAddressId,
      fulfillmentDate: content.requestedDeliveryDate,
      waiver,
      now: this.clock.now(),
    });
  }

  /**
   * Les réglages qui **préremplissent** cette commande.
   *
   * En coursier ils viennent de l'adresse du carnet — et seulement si elle en
   * vient : une adresse dictée à la volée n'a aucun réglage, donc tout ce que le
   * client y met est un choix, pas une reprise.
   *
   * En retrait il n'y a **aucun défaut** : le point est partagé entre tous les
   * clients, ses heures sont une contrainte d'ouverture et non une préférence de
   * ce client-là. Ce que le client demande y est donc toujours un choix.
   */
  private async defaultsFor(content: OrderContent): Promise<FulfillmentDefaults> {
    if (content.fulfillmentMethod === "pickup" || content.deliveryAddressId === null) {
      return NO_DELIVERY_DEFAULTS;
    }
    return this.deliveryDefaults.of(content.deliveryAddressId);
  }

  /**
   * Résout l'acheminement et ses deux ajustements (autoritaires, jamais envoyés
   * par le client). **Retrait** : snapshot du point (choisi ou défaut) + sa remise.
   * **Coursier** : adresse livrée figée + zone **déduite de son code postal**,
   * dont on tire le frais.
   */
  private async resolveFulfillment(
    content: OrderContent,
    subtotalCents: number,
  ): Promise<ResolvedFulfillment> {
    if (content.fulfillmentMethod === "pickup") {
      // La remise vient du service PARTAGÉ avec le devis de la boutique : deux
      // implémentations de « quelle remise s'applique » finiraient par annoncer
      // un montant que la caisse contredit.
      const retrait = await this.adjustments.forPickup(content.pickupAddressId, subtotalCents);
      // La tranche demandée doit tenir dans l'une des fenêtres du point — jamais
      // dans leur union : entre le créneau pro et l'ouverture publique il peut y
      // avoir porte close, et l'accepter serait promettre une remise impossible.
      //
      // Ce contrôle-ci reste à la CAISSE : un devis n'a pas de tranche demandée,
      // et le lui imposer refuserait un panier qu'on veut seulement chiffrer.
      if (!windowFitsPickup(content.requestedWindow ?? null, retrait.point.opening)) {
        throw new PickupClosedAtRequestedTimeError();
      }
      return {
        pickupAddressId: retrait.point.id,
        deliveryZoneId: null,
        deliveryAddress: null,
        pickupAddress: toSnapshot(retrait.point),
        discountCents: retrait.discountCents,
        discountAdjustment: retrait.discountAdjustment,
        // Un retrait n'a pas de frais de zone : pas de barème à figer.
        deliveryFeeAdjustment: null,
        deliveryFeeCents: 0,
      };
    }

    // Coursier — le schéma garantit l'adresse ; on garde une défense typée.
    const address = content.deliveryAddress;
    if (address === null) {
      throw new InvalidOrderFulfillmentError("Adresse de livraison requise en coursier.");
    }
    // La zone se DÉDUIT du code postal livré : c'est une propriété de l'adresse,
    // pas un choix. Personne ne peut donc annoncer un secteur moins cher que le
    // sien — et le devis de la boutique le déduit par la même fonction.
    const coursier = await this.adjustments.forDelivery(address.codePostal, subtotalCents);
    return {
      pickupAddressId: null,
      deliveryZoneId: coursier.zone.id,
      deliveryAddress: address,
      pickupAddress: null,
      discountCents: 0,
      // Le coursier n'ouvre droit à aucune remise : c'est le retrait qui en porte une.
      discountAdjustment: null,
      deliveryFeeCents: coursier.feeCents,
      // Le barème de la zone, figé avec son montant : `zone.fee` est mutable, et
      // une facture doit pouvoir dire « Val d'Isère, 20 € forfaitaires » plutôt
      // que le seul chiffre.
      deliveryFeeAdjustment: coursier.feeAdjustment,
    };
  }
}

/** Le point de retrait résolu, réduit à ses champs postaux (le snapshot figé). */
function toSnapshot(point: PickupAddressView): BillingAddressPayload {
  return {
    label: point.label,
    ligne1: point.ligne1,
    ligne2: point.ligne2,
    codePostal: point.codePostal,
    ville: point.ville,
    pays: point.pays,
  };
}
