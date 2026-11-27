import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";

/**
 * La version que l'écrivain veut garder ne suit pas le numéro que la journée
 * porte : la table des versions et la journée se contredisent. Les deux
 * s'écrivent sous le même verrou, dans la même transaction ; un écart vient
 * d'une écriture faite hors du dépôt, et le geste échoue plutôt que de
 * numéroter deux états sous le même nom.
 */
export class PlanVersionOutOfSequenceError extends TechnicalError {
  constructor(serviceDay: string, version: number, expected: number) {
    super(
      "production.plan_version.out_of_sequence",
      `La version ${version} du plan du ${serviceDay} ne suit pas la version courante ` +
        `(attendue : ${expected}) : la journée et ses versions se contredisent en base. ` +
        "Le geste n'est pas fait ; signalez-le à l'équipe technique avant de le refaire.",
    );
  }
}
