import type { QualityVerdict } from "../../domain/entities/quality-check.js";
import type { QualityTargetRequest } from "../../domain/services/quality-check-scope.js";

/**
 * **Rendre un verdict** sur une ligne de préparation ou une commande colisée
 * (plan `plan-controle-qualite.md`, D2, D8, D9).
 *
 * `id` est tiré par l'écran : c'est la clé d'idempotence. La journée arrive en
 * `string` et passe par `ServiceDay` dans le handler.
 */
export class RenderQualityCheckCommand {
  constructor(
    readonly id: string,
    readonly serviceDay: string,
    readonly target: QualityTargetRequest,
    readonly verdict: QualityVerdict,
    readonly note: string | null,
    readonly uploadIds: readonly string[],
    /** L'identité staff, résolue par le guard. Jamais dans la charge utile. */
    readonly staffUserId: string,
  ) {}
}
