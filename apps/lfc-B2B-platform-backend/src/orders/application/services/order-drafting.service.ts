import {
  cartAdjustmentCents,
  type BillingAddressPayload,
  type CartAdjustment,
  type FulfillmentMethod,
  type OrderLineInput as OrderLineRequest,
  type PickupAddressView,
} from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { DeliveryZoneRepository } from "../../../delivery-zones/domain/delivery-zone.repository.js";
import { PickupAddressRepository } from "../../../pickup-addresses/domain/pickup-address.repository.js";
import { Order } from "../../domain/entities/order.js";
import {
  InvalidOrderFulfillmentError,
  NoDeliveryZoneForPostalCodeError,
  PickupNotConfiguredError,
  UnknownSkuError,
} from "../../domain/errors/order-errors.js";
import { ProductCatalogReader } from "../../domain/ports/product-catalog.reader.js";
import type { OrderLineInput } from "../../domain/value-objects/order-line.js";

/** Ce qu'un panier demande, quelle que soit la porte par laquelle il arrive. */
export interface OrderContent {
  readonly fulfillmentMethod: FulfillmentMethod;
  readonly deliveryAddress: BillingAddressPayload | null;
  readonly pickupAddressId: string | null;
  readonly requestedDeliveryDate: string | null;
  readonly note: string;
  readonly lines: readonly OrderLineRequest[];
}

/** Qui est concerné : le client porté, et le membre de l'équipe s'il a saisi. */
export interface OrderParties {
  readonly companyId: string | null;
  readonly placedByUserId: string;
  readonly placedByStaffId: string | null;
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
    private readonly catalog: ProductCatalogReader,
    private readonly pickups: PickupAddressRepository,
    private readonly zones: DeliveryZoneRepository,
  ) {}

  /** Compose la commande. Le règlement reste à décider par l'appelant. */
  async draft(parties: OrderParties, content: OrderContent): Promise<Order> {
    const lines = this.resolveLines(content.lines);
    const subtotalCents = lines.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0);
    const acheminement = await this.resolveFulfillment(content, subtotalCents);
    return Order.draft({
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
      lines,
      discountCents: acheminement.discountCents,
      discountAdjustment: acheminement.discountAdjustment,
      deliveryFeeCents: acheminement.deliveryFeeCents,
    });
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

  /**
   * Fusionne les lignes par SKU (quantités additionnées) puis résout chacune au
   * catalogue — c'est ici que le prix devient autoritaire, jamais celui du client.
   */
  private resolveLines(input: readonly OrderLineRequest[]): OrderLineInput[] {
    const quantities = new Map<string, number>();
    for (const line of input) {
      quantities.set(line.sku, (quantities.get(line.sku) ?? 0) + line.quantity);
    }
    return [...quantities].map(([sku, quantity]) => {
      const item = this.catalog.resolve(sku);
      if (item === null) {
        throw new UnknownSkuError(sku);
      }
      return {
        sku: item.sku,
        productName: item.name,
        unitPriceCents: item.unitPriceCents,
        vatRate: item.vatRate,
        quantity,
      };
    });
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
