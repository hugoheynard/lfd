import type { ServiceDay } from "../value-objects/service-day.value-object.js";

/**
 * **Où ranger une photo de contrôle** (plan `plan-controle-qualite.md`, D8).
 *
 * La clé ne vient JAMAIS du client : elle se compose d'identifiants que le
 * serveur a tirés (le dépôt) ou vérifiés (le contrôle, sa journée). Deux
 * préfixes, et la différence compte le jour où une règle de cycle de vie est
 * posée sur le bucket : `quality/pending/` se balaie, le reste de `quality/`
 * se garde sans limite de temps (Q-C).
 */
export const PENDING_QUALITY_PREFIX = "quality/pending/";

/** Le dépôt provisoire : la photo attend son verdict. */
export function pendingQualityPhotoKey(uploadId: string): string {
  return `${PENDING_QUALITY_PREFIX}${uploadId}`;
}

/** La photo rattachée, rangée sous sa journée et son contrôle. */
export function qualityPhotoKey(serviceDay: ServiceDay, checkId: string, position: number): string {
  return `quality/${serviceDay.value}/${checkId}/${String(position)}`;
}
