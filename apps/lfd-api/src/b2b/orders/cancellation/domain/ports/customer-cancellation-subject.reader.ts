import type { FixedCustomerCancellation } from "../services/customer-cancellation-window.js";

/**
 * **Une commande, vue de l'annulation par le client** (doc
 * `documentation/commandes/annulation/annulation-par-le-client.md`, lot C6,
 * C6.2 à C6.4) — ce que le mur, le réglage et le lien d'invité lisent AVANT
 * d'entrer dans le noyau. La règle staff, elle, relit sa propre vue
 * (`CancellationSubjectReader`) : les deux ne se mélangent pas.
 */
export interface CustomerCancellationSubject {
  readonly orderId: string;
  /** La société DE LA COMMANDE — le mur se lit dessus (C6.2), jamais sur l'espace actif. */
  readonly companyId: string | null;
  readonly placedByUserId: string;
  /** `AAAA-MM-JJ`, ou `null` : commande sans jour. */
  readonly serviceDay: string | null;
  /** `HH:mm` du début du créneau figé, ou `null`. */
  readonly windowStart: string | null;
  /**
   * Jusqu'à quand le particulier annule, FIGÉ à sa passation (2026-10-26) et
   * recalculé par une révision avec le délai d'origine : posé, il fait foi
   * contre le réglage du jour.
   */
  readonly customerCancellableUntil: Date | null;
  /** Le délai figé à la passation — « sans délai » compris (2026-10-26). */
  readonly customerCancellation: FixedCustomerCancellation;
  /** L'instant de la passation — la borne des 90 jours d'un lien sans date (C6.4). */
  readonly placedAt: Date;
  /** La fiche de qui a commandé : un compte connectable, et active ou non (S3). */
  readonly buyer: { readonly hasAccount: boolean; readonly active: boolean };
}

/** Port de **lecture**, sans verrou ni mur : le mur est la décision de l'appelant. */
export abstract class CustomerCancellationSubjectReader {
  abstract find(orderId: string): Promise<CustomerCancellationSubject | null>;
}
