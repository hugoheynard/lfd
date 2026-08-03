import type { BillingAddressPayload, FulfillmentMethod } from "@lfd/contracts";

/** Une ligne prête à persister : SKU + snapshots (nom, prix, TVA) + total. */
export interface OrderLineToPersist {
  readonly sku: string;
  readonly productName: string;
  readonly unitPriceCents: number;
  readonly vatRate: number;
  readonly quantity: number;
  readonly lineTotalCents: number;
}

/** Une commande prête à écrire — tout est déjà résolu et calculé côté serveur. */
export interface OrderToPlace {
  readonly companyId: string;
  readonly placedByUserId: string;
  /** Acheminement : `delivery` → `deliveryAddressId` ; `pickup` → `pickupAddress`. */
  readonly fulfillmentMethod: FulfillmentMethod;
  /** Adresse de livraison (livraison), ou `null` (retrait). */
  readonly deliveryAddressId: string | null;
  /** Adresse de retrait **figée** (retrait), ou `null` (livraison). */
  readonly pickupAddress: BillingAddressPayload | null;
  readonly requestedDeliveryDate: Date | null;
  readonly note: string;
  readonly subtotalCents: number;
  /** Remise (retrait) déduite, en centimes. `0` si aucune. */
  readonly discountCents: number;
  /** Frais de livraison (zone) ajouté, en centimes. `0` si aucun. */
  readonly deliveryFeeCents: number;
  readonly totalCents: number;
  readonly lines: readonly OrderLineToPersist[];
}

/** Ce que la passation renvoie : l'id technique et le numéro humain. */
export interface PlacedOrder {
  readonly id: string;
  readonly orderNumber: string;
}

/**
 * Port d'**écriture** des commandes.
 *
 * La passation vérifie **dans la transaction** que l'adresse de livraison
 * appartient bien à l'entreprise (livraison, non archivée) avant de créer la
 * commande et ses lignes — une commande ne peut jamais pointer l'adresse d'une
 * autre entreprise.
 */
export abstract class OrderRepository {
  /**
   * Crée la commande et ses lignes en une transaction.
   * @throws {DeliveryAddressInvalidError} l'adresse ne relève pas de l'entreprise.
   */
  abstract place(order: OrderToPlace): Promise<PlacedOrder>;
}
