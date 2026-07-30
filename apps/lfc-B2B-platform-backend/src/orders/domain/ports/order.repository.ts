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
  readonly deliveryAddressId: string;
  readonly requestedDeliveryDate: Date | null;
  readonly note: string;
  readonly subtotalCents: number;
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
