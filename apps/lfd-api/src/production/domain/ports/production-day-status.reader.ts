import type { ServiceDay } from "../value-objects/service-day.value-object.js";

/**
 * **« Cette journée est-elle arrêtée ? »** — l'en-tête seul, sans relire le
 * plan (audit du réassort, 2026-11-02).
 *
 * L'arrêt lisait la journée ENTIÈRE (commandes, lignes, compte, fournées)
 * hors verrou pour ne lire que `closedAt`, et seulement pour épargner une
 * question au commerce. Un port à part du dépôt (ISP) : il ne décide de
 * rien — toute décision se reprend sous le verrou, sur la journée relue.
 */
export abstract class ProductionDayStatusReader {
  abstract isClosed(day: ServiceDay): Promise<boolean>;
}
