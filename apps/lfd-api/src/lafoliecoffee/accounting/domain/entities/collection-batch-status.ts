/**
 * L'état d'un lot de prélèvement. Une VALEUR : elle vit en base
 * (`CollectionBatchStatus`), elle ne se renomme que par migration.
 *
 * - `constituted` — préparé, à déposer ;
 * - `deposited` — déposé dans CENET ;
 * - `cancelled` — retiré par l'équipe AVANT dépôt ;
 * - `rejected_by_bank` — déposé, puis son fichier entier refusé par la
 *   banque (accusé PSR1). Terminal (plan `plan-lot-rejete-par-la-banque.md`).
 */
export type CollectionBatchStatus = "constituted" | "deposited" | "cancelled" | "rejected_by_bank";

/**
 * Les états d'un lot **mort** : il ne prélève rien, ne couvre plus sa
 * clôture, ne présente aucun mandat, ne règle aucune facture. Annulé et
 * rejeté par la banque ne diffèrent qu'à l'affichage et dans la trace.
 *
 * Une seule liste, pour qu'un futur état mort n'en oublie aucun lecteur :
 * chaque question « ce lot est-il vivant ? » passe par {@link isDeadBatchStatus}
 * (domaine, application) ou par sa traduction Prisma
 * (`infrastructure/live-batch-status.ts`).
 */
export const DEAD_BATCH_STATUSES: readonly CollectionBatchStatus[] = [
  "cancelled",
  "rejected_by_bank",
];

/** Le lot est-il mort — annulé, ou rejeté par la banque ? */
export function isDeadBatchStatus(status: CollectionBatchStatus): boolean {
  return DEAD_BATCH_STATUSES.includes(status);
}
