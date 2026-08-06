import type { BillingAddressPayload, FulfillmentMethod, Recurrence } from "@lfd/contracts";

/** Une ligne du gabarit à persister (SKU + quantité). */
export interface SubscriptionLineToPersist {
  readonly sku: string;
  readonly quantity: number;
}

/** Un panier récurrent prêt à écrire — tout est déjà résolu côté serveur. */
export interface SubscriptionToCreate {
  /** Mur : le client connecté (comme une commande perso zéro friction). */
  readonly placedByUserId: string;
  /** Commande d'origine (traçabilité), ou `null`. */
  readonly fromOrderId: string | null;
  readonly recurrence: Recurrence;
  readonly startDate: Date;
  readonly endDate: Date | null;
  readonly fulfillmentMethod: FulfillmentMethod;
  /** Adresse de livraison **libre figée** (livraison), ou `null` (retrait). */
  readonly deliveryAddress: BillingAddressPayload | null;
  /** Point de retrait choisi (retrait), ou `null` (défaut / livraison). */
  readonly pickupAddressId: string | null;
  readonly note: string;
  readonly lines: readonly SubscriptionLineToPersist[];
}

/** Ce que la création renvoie : l'id technique. */
export interface CreatedSubscription {
  readonly id: string;
}

/**
 * Dérogation d'une échéance à écrire (« modifier cette commande uniquement »).
 * `skipped` ⇒ échéance sautée (lignes vides) ; sinon `lines` remplace le gabarit
 * pour cette date-là. L'unicité `(subscriptionId, occurrenceDate)` en fait un upsert.
 */
export interface OccurrenceOverrideToUpsert {
  readonly subscriptionId: string;
  readonly occurrenceDate: Date;
  readonly skipped: boolean;
  readonly lines: readonly SubscriptionLineToPersist[];
  readonly note: string;
}

/**
 * Port d'**écriture** des paniers récurrents. Séparé de la lecture (ISP) : un
 * handler de création n'a pas besoin de savoir agréger la liste.
 */
export abstract class SubscriptionRepository {
  abstract create(subscription: SubscriptionToCreate): Promise<CreatedSubscription>;
  abstract upsertOccurrence(override: OccurrenceOverrideToUpsert): Promise<void>;
}
