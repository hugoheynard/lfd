import type { CustomerRequest } from "../customer-request.js";

/** Port d'**écriture** des demandes : l'agrégat entier — enveloppe, détails, photos. */
export abstract class CustomerRequestRepository {
  abstract load(id: string): Promise<CustomerRequest | null>;
  /** Crée la demande reçue, ou enregistre son traitement ou son anonymisation. */
  abstract save(request: CustomerRequest): Promise<void>;
}
