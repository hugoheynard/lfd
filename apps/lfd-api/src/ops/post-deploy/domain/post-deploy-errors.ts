import { BusinessError, ResourceNotFoundError } from "../../../platform/shared/errors/app-error.js";

/**
 * Les refus des opérations après déploiement
 * (`documentation/ops/plan-operations-apres-deploiement.md`, § 3.6 et § 7).
 * Lus par la personne qui clique, sans le code : chacun dit le geste de sortie.
 */

/** La clé ne désigne aucune opération de cette image. */
export class UnknownPostDeployOperationError extends ResourceNotFoundError {
  constructor(key: string) {
    super(
      "POST_DEPLOY_OPERATION_UNKNOWN",
      `Aucune opération après déploiement « ${key} » dans cette version. ` +
        "Elle a pu être retirée une fois faite : rechargez la page « Après déploiement ».",
    );
  }
}

/** Le passage demandé n'existe pas. */
export class PostDeployRunNotFoundError extends ResourceNotFoundError {
  constructor(runId: string) {
    super(
      "POST_DEPLOY_RUN_NOT_FOUND",
      `Aucun passage « ${runId} » dans la trace des opérations après déploiement. ` +
        "Rechargez la page « Après déploiement » pour relire le dernier passage.",
    );
  }
}

/** « Appliquer » sans simulation de cette personne, ou après l'avoir déjà appliquée. */
export class SimulationRequiredError extends BusinessError {
  constructor(key: string) {
    super(
      "POST_DEPLOY_SIMULATION_REQUIRED",
      `Aucune simulation de « ${key} » à appliquer à votre nom. ` +
        "Simulez d'abord, lisez le compte, puis appliquez.",
    );
  }
}

/** La simulation a été faite par une autre personne. */
export class SimulationOfAnotherAuthorError extends BusinessError {
  constructor(key: string) {
    super(
      "POST_DEPLOY_SIMULATION_OTHER_AUTHOR",
      `La simulation de « ${key} » a été faite par une autre personne : ` +
        "on n'applique que ce qu'on a lu soi-même. Simulez d'abord.",
    );
  }
}

/** La simulation a été faite par une autre image que celle qui répond. */
export class SimulationOfAnotherRevisionError extends BusinessError {
  constructor(key: string) {
    super(
      "POST_DEPLOY_SIMULATION_OTHER_REVISION",
      `La simulation de « ${key} » a été faite par une autre version déployée : ` +
        "ce qu'elle a compté ne vaut plus. Simulez d'abord.",
    );
  }
}

/** La simulation date de plus de quinze minutes. */
export class SimulationExpiredError extends BusinessError {
  constructor(key: string, minutes: number) {
    super(
      "POST_DEPLOY_SIMULATION_EXPIRED",
      `La simulation de « ${key} » date de plus de ${String(minutes)} minutes : ` +
        "la base a pu bouger depuis. Simulez d'abord.",
    );
  }
}

/** Une application de la même opération est déjà en cours. */
export class PostDeployAlreadyRunningError extends BusinessError {
  constructor(key: string) {
    super(
      "POST_DEPLOY_ALREADY_RUNNING",
      `« ${key} » est déjà en cours d'application. ` +
        "Attendez qu'elle se termine, puis relisez son rapport avant de relancer.",
    );
  }
}

/** Une opération qui doit passer avant est encore à faire (§ 7.1). */
export class PostDeployPredecessorPendingError extends BusinessError {
  constructor(key: string, predecessor: string) {
    super(
      "POST_DEPLOY_PREDECESSOR_PENDING",
      `« ${key} » ne s'applique qu'après « ${predecessor} », qui est encore à faire. ` +
        `Simulez et appliquez « ${predecessor} » d'abord.`,
    );
  }
}

/** Le passage a changé d'état entre la lecture et l'écriture (un second clic, une autre instance). */
export class PostDeployRunChangedError extends BusinessError {
  constructor(runId: string) {
    super(
      "POST_DEPLOY_RUN_CHANGED",
      `Le passage « ${runId} » a changé pendant votre geste — un autre clic l'a sans doute lancé. ` +
        "Rechargez la page et relisez son état.",
    );
  }
}

/** Une transition que la machine d'états ne connaît pas — un appel du code, pas un clic. */
export class IllegalPostDeployTransitionError extends BusinessError {
  constructor(runId: string, from: string, to: string) {
    super(
      "POST_DEPLOY_ILLEGAL_TRANSITION",
      `Le passage « ${runId} » est « ${from} » : il ne peut pas passer à « ${to} ». ` +
        "Rechargez la page et relisez son état.",
    );
  }
}
