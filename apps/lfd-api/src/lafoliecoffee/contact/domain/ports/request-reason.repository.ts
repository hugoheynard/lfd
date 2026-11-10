import type { RequestReason } from "../request-reason.js";

/**
 * Port d'**écriture** des motifs : charger, enregistrer le motif entier. Une
 * demande le lit aussi (`load`) pour savoir s'il est proposé par ce
 * formulaire à ce public, et pour l'adresse de destination.
 */
export abstract class RequestReasonRepository {
  /** `null` s'il n'existe pas. Un motif archivé est rendu : c'est à lui de dire qu'il n'est plus proposé. */
  abstract load(id: string): Promise<RequestReason | null>;
  abstract save(reason: RequestReason): Promise<void>;
}
