import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
  TechnicalError,
} from "../../../../../platform/shared/errors/app-error.js";

/** Une réémission de fiche sans fiche, ou de tout avec une fiche : la forme est fausse. */
export class InvalidReemissionScopeError extends DomainError {
  constructor() {
    super(
      "catalogue.reemission.invalid_scope",
      "Une réémission vise une fiche (avec son identifiant) ou tout le catalogue (sans " +
        "identifiant). Préciser l'un ou l'autre, puis relancer.",
    );
  }
}

/** Personne ne lance une réémission à la place de personne : l'auteur est inscrit au travail. */
export class AnonymousReemissionError extends BusinessError {
  constructor() {
    super(
      "catalogue.reemission.anonymous",
      "Lancer une réémission demande une identité : le travail inscrit qui l'a lancé. " +
        "Se reconnecter au back-office, puis relancer.",
    );
  }
}

/**
 * Un « tout » est déjà en cours : en lancer un second doublerait chaque fait
 * pour rien, et deux comptes rendus se disputeraient la même minute.
 */
export class ReemissionAlreadyRunningError extends BusinessError {
  constructor(readonly runningJobId: string | null) {
    super(
      "catalogue.reemission.already_running",
      "Une réémission de tout le catalogue est déjà en cours. Attendre qu'elle finisse — son " +
        "compte rendu s'affiche à l'écran — puis relancer si des fiches restent en retard.",
    );
  }
}

/** Le travail demandé n'existe pas. */
export class ReemissionJobNotFoundError extends ResourceNotFoundError {
  constructor(readonly jobId: string) {
    super(
      "catalogue.reemission.not_found",
      `Aucune réémission n'a l'identifiant ${jobId}. Relire la dernière depuis l'écran ` +
        "Intégrations.",
    );
  }
}

/** Un travail clos ne se rouvre pas : son compte rendu est ce qui a eu lieu. */
export class ReemissionJobClosedError extends BusinessError {
  constructor(readonly jobId: string) {
    super(
      "catalogue.reemission.closed",
      `La réémission ${jobId} est déjà close : son compte rendu ne change plus. Lancer une ` +
        "nouvelle réémission pour réessayer.",
    );
  }
}

/**
 * Une **famille** n'a pas pu partir : la réémission s'arrête avant la première
 * fiche, qui aurait pu viser une famille inconnue de la plateforme.
 */
export class FamilyReemissionFailedError extends TechnicalError {
  constructor(familyId: string, cause: unknown) {
    super(
      "catalogue.reemission.family_failed",
      `La famille ${familyId} n'a pas pu être réémise (${messageOf(cause)}). Aucune fiche ` +
        "n'est partie ; relancer la réémission.",
      cause,
    );
  }
}

/**
 * Les **règles** n'ont pas pu partir — en dernier, après toutes les fiches.
 * Les fiches comptées sont parties ; relancer est sans risque.
 */
export class RulesReemissionFailedError extends TechnicalError {
  constructor(cause: unknown) {
    super(
      "catalogue.reemission.rules_failed",
      `Les fiches sont parties, mais les règles de commande n'ont pas pu être réémises ` +
        `(${messageOf(cause)}). Relancer la réémission est sans risque.`,
      cause,
    );
  }
}

/** Le message d'une cause quelconque, pour un compte rendu lu par une personne. */
export function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
