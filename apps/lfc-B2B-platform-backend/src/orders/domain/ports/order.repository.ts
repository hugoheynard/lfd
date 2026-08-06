import type { BillingAddressPayload, FulfillmentMethod, PaymentStatus } from "@lfd/contracts";

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
  /** Entreprise cliente, ou `null` = commande personnelle (mur = `placedByUserId`). */
  readonly companyId: string | null;
  readonly placedByUserId: string;
  /** Acheminement : `delivery` = coursier (zone + adresse libre) ; `pickup` = retrait. */
  readonly fulfillmentMethod: FulfillmentMethod;
  /** Zone de livraison choisie (coursier), ou `null` (retrait). */
  readonly deliveryZoneId: string | null;
  /** Adresse de livraison **libre figée** (coursier), ou `null` (retrait). */
  readonly deliveryAddress: BillingAddressPayload | null;
  /** Adresse de retrait **figée** (retrait), ou `null` (livraison). */
  readonly pickupAddress: BillingAddressPayload | null;
  readonly requestedDeliveryDate: Date | null;
  readonly note: string;
  /** Sous-total marchandises **HT**, en centimes. */
  readonly subtotalCents: number;
  /** Remise (retrait) déduite, en centimes. `0` si aucune. */
  readonly discountCents: number;
  /** Frais de livraison (zone) ajouté, HT, en centimes. `0` si aucun. */
  readonly deliveryFeeCents: number;
  /** TVA totale (marchandises par taux + livraison), en centimes. */
  readonly vatCents: number;
  /** Total **TTC** encaissé = `max(0, subtotal − discount) + deliveryFee + vat`. */
  readonly totalCents: number;
  /** État de règlement à la création : `pending` (carte per_order) ou `not_required`. */
  readonly paymentStatus: PaymentStatus;
  /** Intention Stripe rattachée (per_order), ou `null` (terme différé / gratuit). */
  readonly stripePaymentIntentId: string | null;
  readonly lines: readonly OrderLineToPersist[];
}

/** Ce que la passation renvoie : l'id technique et le numéro humain. */
export interface PlacedOrder {
  readonly id: string;
  readonly orderNumber: string;
}

/**
 * Port d'**écriture** des commandes. Coursier et retrait figent leurs adresses en
 * **snapshot** (comme les prix) : la commande ne dépend d'aucune ligne mutable.
 */
export abstract class OrderRepository {
  /** Crée la commande et ses lignes en une transaction. */
  abstract place(order: OrderToPlace): Promise<PlacedOrder>;

  /**
   * Marque **payée** la commande portant cette intention Stripe. **Idempotent** :
   * ne touche que les commandes encore `pending` (une commande déjà `paid`, ou un
   * intent inconnu, laisse l'appel sans effet) — Stripe peut réémettre l'événement.
   */
  abstract markPaid(paymentIntentId: string): Promise<void>;

  /**
   * Marque **échoué** le règlement de la commande portant cette intention. Même
   * idempotence : ne passe à `failed` que ce qui était `pending` (un paiement
   * déjà `paid` — course rare — n'est pas rétrogradé).
   */
  abstract markPaymentFailed(paymentIntentId: string): Promise<void>;
}
