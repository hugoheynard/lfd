import type { CloseMode } from "../../domain/entities/production-close-settings.js";

/**
 * **Régler l'arrêt du plan** — automatique à une heure, ou manuel avec une
 * heure d'alerte (plan `documentation/production/plan-arret-du-plan.md`, §2).
 *
 * Les heures arrivent brutes : c'est l'agrégat qui les juge.
 */
export class ChangeProductionCloseSettingsCommand {
  constructor(
    readonly mode: CloseMode,
    readonly closeAt: string | null,
    readonly alertAt: string | null,
    /** L'identité staff, résolue par le guard. Jamais dans la charge utile. */
    readonly staffUserId: string,
  ) {}
}
