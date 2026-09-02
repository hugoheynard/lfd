import {
  cartAdjustmentCents,
  type BillingAddressPayload,
  type CartAdjustment,
  type FulfillmentMethod,
  type OrderLineInput as OrderLineRequest,
  type PickupAddressView,
} from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { CatalogVersionReader } from "../../../catalog/domain/ports/catalog-version.reader.js";
import { DeliveryZoneRepository } from "../../../delivery-zones/domain/delivery-zone.repository.js";
import { PickupAddressRepository } from "../../../pickup-addresses/domain/pickup-address.repository.js";
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
  NoDeliveryZoneForPostalCodeError,
  PickupClosedAtRequestedTimeError,
  PickupNotConfiguredError,
} from "../../domain/errors/order-errors.js";
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

/** Acheminement résolu : les snapshots à figer et les deux ajustements de prix. */
interface ResolvedFulfillment {
  readonly deliveryZoneId: string | null;
  readonly deliveryAddress: BillingAddressPayload | null;
  readonly pickupAddress: BillingAddressPayload | null;
  readonly discountCents: number;
  /** L'ajustement figé qui l'a produite (taux/montant du point), ou `null`. */
  readonly discountAdjustment: CartAdjustment | null;
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
    private readonly pickups: PickupAddressRepository,
    private readonly zones: DeliveryZoneRepository,
    private readonly deliveryDefaults: DeliveryDefaultsReader,
  ) {}

  /** Compose la commande. Le règlement reste à décider par l'appelant. */
  async draft(parties: OrderParties, content: OrderContent): Promise<Order> {
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
    const agreed = agreeFulfillment(
      {
        window: content.requestedWindow,
        contact: content.deliveryContact,
        signatureRequired: content.signatureRequired,
      },
      await this.defaultsFor(content),
    );
    return Order.draft({
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
      deliveryFeeCents: acheminement.deliveryFeeCents,
    });
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
      const point = await this.pickups.resolve(content.pickupAddressId);
      if (point === null) {
        throw new PickupNotConfiguredError();
      }
      // La tranche demandée doit tenir dans l'une des fenêtres du point — jamais
      // dans leur union : entre le créneau pro et l'ouverture publique il peut y
      // avoir porte close, et l'accepter serait promettre une remise impossible.
      if (!windowFitsPickup(content.requestedWindow ?? null, point.opening)) {
        throw new PickupClosedAtRequestedTimeError();
      }
      return {
        deliveryZoneId: null,
        deliveryAddress: null,
        pickupAddress: toSnapshot(point),
        discountCents: point.discount ? cartAdjustmentCents(point.discount, subtotalCents) : 0,
        discountAdjustment: point.discount,
        deliveryFeeCents: 0,
      };
    }

    // Coursier — le schéma garantit l'adresse ; on garde une défense typée.
    const address = content.deliveryAddress;
    if (address === null) {
      throw new InvalidOrderFulfillmentError("Adresse de livraison requise en coursier.");
    }
    // La zone se DÉDUIT du code postal livré : c'est une propriété de l'adresse,
    // pas un choix. Personne ne peut donc annoncer un secteur moins cher que le sien.
    const zone = await this.zones.resolveForPostalCode(address.codePostal);
    if (zone === null) {
      throw new NoDeliveryZoneForPostalCodeError(address.codePostal);
    }
    return {
      deliveryZoneId: zone.id,
      deliveryAddress: address,
      pickupAddress: null,
      discountCents: 0,
      // Le coursier n'ouvre droit à aucune remise : c'est le retrait qui en porte une.
      discountAdjustment: null,
      deliveryFeeCents: cartAdjustmentCents(zone.fee, subtotalCents),
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
