import { BusinessError, ResourceNotFoundError } from "../../../platform/shared/errors/app-error.js";

/**
 * Les refus du **lancement d'un réassort « au plus tôt »** (R4a,
 * `documentation/reassort-boutiques/plan-au-plus-tot.md` §2). Lus au Prod
 * manager par le fournil, sans le code sous les yeux : chacun nomme le cas
 * et le geste de sortie.
 */

/** Le réassort est déjà au plan du jour : un second « Lancer » le compterait deux fois. */
export class ResupplyAlreadyLaunchedError extends BusinessError {
  constructor(serviceDay: string) {
    super(
      "production.resupply.already_launched",
      `Ce réassort « au plus tôt » est déjà lancé pour le ${serviceDay} : il est au plan du ` +
        "fournil et compté dans les fournées. Rien à refaire ; relisez la liste des réassorts.",
    );
  }
}

/**
 * Aucun réassort « au plus tôt » envoyé et non annulé ne porte cet
 * identifiant pour cette journée — le comptoir l'a annulé, ou il vise un
 * autre jour.
 */
export class ResupplyToLaunchNotFoundError extends ResourceNotFoundError {
  constructor(serviceDay: string) {
    super(
      "production.resupply.to_launch_not_found",
      `Aucun réassort « au plus tôt » envoyé pour le ${serviceDay} ne correspond : le comptoir ` +
        "l'a peut-être annulé entre-temps. Relisez la liste des réassorts.",
    );
  }
}

/**
 * La journée n'est pas arrêtée et porte encore des commandes ou des
 * réassorts du soir : l'ouvrir avec ce seul réassort les laisserait hors du
 * plan, sans que personne le sache (garde de Q5, qui suppose une journée vide).
 */
export class ResupplyLaunchOnUnarrestedPlanError extends BusinessError {
  constructor(serviceDay: string) {
    super(
      "production.resupply.launch_on_unarrested_plan",
      `Le plan du ${serviceDay} n'est pas arrêté et porte encore des commandes ou des réassorts ` +
        "du soir : lancer ce réassort les laisserait hors du plan. Arrêtez d'abord le plan du " +
        "jour (Prod manager), puis lancez le réassort.",
    );
  }
}
