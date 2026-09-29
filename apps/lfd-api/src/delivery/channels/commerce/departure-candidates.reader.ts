import type { BillingAddressPayload, GpsPoint } from "@lfd/contracts";

/** Un point de retrait, tel que la livraison a besoin de le connaître. */
export interface DepartureCandidate {
  readonly pickupAddressId: string;
  readonly label: string;
  readonly address: BillingAddressPayload;
  readonly gps: GpsPoint | null;
  /** Le point par défaut du commerce — le départ tant que personne n'a choisi. */
  readonly isDefault: boolean;
}

/**
 * **Les points de retrait candidats au départ des tournées** — ce que la
 * livraison DÉCLARE et que le commerce implémente
 * (`b2b/pickup-addresses/infrastructure/`), relié dans `appBootstrap`.
 *
 * La livraison ne lit pas `pickup_addresses` : l'adresse du labo n'a qu'une
 * source, et la recopier ferait deux vérités qui divergeraient au premier
 * déménagement (plan, Q9).
 */
export abstract class DepartureCandidatesReader {
  /** Tous les points de retrait, le défaut en tête. */
  abstract list(): Promise<readonly DepartureCandidate[]>;
}
