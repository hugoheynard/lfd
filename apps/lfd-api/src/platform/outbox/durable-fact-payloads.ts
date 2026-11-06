/**
 * Port de **lecture** : la charge d'un fait durable déjà écrit, par sa clé
 * déterministe.
 *
 * Pour l'abonné qui doit refaire son effet HORS de la livraison — le
 * balayeur du bloc `mail` renvoie un e-mail dont l'envoi d'après validation
 * n'a pas eu lieu (plan `plan-service-e-mails.md`, § 8). Les données du
 * modèle ne sont pas dans le suivi (C7) : elles ne vivent que dans le fait.
 *
 * Distinct d'`Outbox` (écriture) et du dépôt du rejeu (ISP).
 */
export abstract class DurableFactPayloads {
  /** La charge du fait de cette clé, ou `null` s'il n'existe pas (ou plus). */
  abstract payloadOf(key: string): Promise<Readonly<Record<string, unknown>> | null>;
}
