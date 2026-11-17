/**
 * **« Marquer traité »** — un responsable a pris le rouge en charge (plan
 * `documentation/fournil/plan-niveaux-de-suivi.md`, § 3.8). Le plafond reste.
 */
export class ResolveProblemCommand {
  constructor(
    readonly problemId: string,
    /** L'identité staff, résolue par le guard. Jamais dans la charge utile. */
    readonly staffUserId: string,
    /** La clé d'intention de l'écran. */
    readonly intentKey: string,
  ) {}
}
