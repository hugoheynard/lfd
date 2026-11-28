import type { DossierResendTarget } from "../../domain/services/dossier-resend-targets.js";

/**
 * **Renvoyer le dossier de la version courante du plan**
 * (`documentation/fournil/les-versions-du-plan.md`) : à une
 * ligne de la liste, ou à tous ceux dont la version reçue est dépassée.
 */
export class ResendPlanVersionDossierCommand {
  constructor(
    /** `AAAA-MM-JJ`. */
    readonly serviceDay: string,
    readonly target: DossierResendTarget,
    /** L'identité staff de qui renvoie, résolue par le guard. Jamais dans la charge utile. */
    readonly staffUserId: string,
    /**
     * La clé d'intention de l'écran (en-tête `Idempotency-Key`) : un double
     * clic ne renvoie pas deux fois.
     */
    readonly intentKey: string,
  ) {}
}
