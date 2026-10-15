import type { BillingAddressPayload, GpsPoint } from "@lfd/contracts";

/** Un site qui livre, tel que la livraison a besoin de le connaître. */
export interface DepartureCandidate {
  readonly pickupAddressId: string;
  readonly label: string;
  readonly address: BillingAddressPayload;
  readonly gps: GpsPoint | null;
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
  /** Les sites actifs qui livrent, par ancienneté. */
  abstract list(): Promise<readonly DepartureCandidate[]>;
}
