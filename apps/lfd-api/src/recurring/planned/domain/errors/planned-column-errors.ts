import {
  AuthorizationError,
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

// ─── Données mal formées : le modèle se protège lui-même (400) ───────────────

export class InvalidPlannedLineError extends DomainError {
  constructor(
    readonly sku: string,
    readonly reason: string,
  ) {
    super("planner.line.invalid", `Ligne « ${sku} » : ${reason}`);
  }
}

/** Un article ne figure qu'une fois par jour : la quantité se règle sur sa carte. */
export class DuplicatePlannedLineError extends DomainError {
  constructor(readonly sku: string) {
    super(
      "planner.line.duplicate",
      `L'article ${sku} figure deux fois dans ce jour : réglez sa quantité sur une seule carte.`,
    );
  }
}

export class InvalidPlannedRoutingError extends DomainError {
  constructor(readonly reason: string) {
    super("planner.routing.invalid", reason);
  }
}

/** Un jour planifié est celui d'une société : le planificateur est réservé aux pros. */
export class PlannedColumnWithoutCompanyError extends DomainError {
  constructor() {
    super(
      "planner.company.missing",
      "Un jour planifié appartient à une société : choisissez l'espace d'une société pour planifier.",
    );
  }
}

// ─── Refus métier selon le jour et l'état (409) ──────────────────────────────

export class PlannedColumnInPastError extends BusinessError {
  constructor(readonly day: string) {
    super(
      "planner.day.past",
      `Le ${day} est passé : il ne se planifie plus. Choisissez un jour à venir.`,
    );
  }
}

export class PlannedColumnBeyondHorizonError extends BusinessError {
  constructor(
    readonly day: string,
    readonly lastDay: string,
  ) {
    super(
      "planner.day.beyond_horizon",
      `Le ${day} est trop loin : on planifie jusqu'au ${lastDay}. Revenez plus tard pour ce jour.`,
    );
  }
}

/**
 * La colonne se commande, ou s'est commandée : le client ne l'écrit plus. Ce
 * que la commande porte est ce que l'écran montrait (règle 6 du plan).
 */
export class PlannedColumnFrozenError extends BusinessError {
  constructor(readonly day: string) {
    super(
      "planner.day.frozen",
      `La colonne du ${day} se commande : il ne se modifie plus ici. Modifiez la commande elle-même depuis vos commandes.`,
    );
  }
}

/** Une autre colonne vivante du même jour occupe déjà ce créneau. */
export class PlannedWindowTakenError extends BusinessError {
  constructor(readonly day: string) {
    super(
      "planner.window.taken",
      `Le ${day} a déjà une colonne sur ce créneau : complétez-la, ou choisissez un autre créneau.`,
    );
  }
}

/** Deux onglets ont écrit le même jour : le second relit avant d'écraser. */
export class PlannedColumnVersionConflictError extends BusinessError {
  constructor(readonly day: string) {
    super(
      "planner.day.version_conflict",
      `La colonne du ${day} a été modifié ailleurs entre-temps : rechargez le planificateur, puis refaites votre changement.`,
    );
  }
}

/** Une issue s'inscrit une seule fois, sur une colonne encore en brouillon. */
export class PlannedColumnAlreadySettledError extends BusinessError {
  constructor(readonly day: string) {
    super(
      "planner.day.already_settled",
      `La colonne du ${day} a déjà son issue : il n'en reçoit pas d'autre.`,
    );
  }
}

// ─── Le mur ──────────────────────────────────────────────────────────────────

/** La colonne n'existe pas, est retirée, ou n'est pas à cette société (404 non divulguant). */
export class PlannedColumnNotFoundError extends ResourceNotFoundError {
  constructor(readonly columnId: string) {
    super(
      "planner.column.not_found",
      "Cette colonne n'existe plus : elle a peut-être été retirée. Rechargez le planificateur.",
    );
  }
}

/** Le planificateur est réservé aux sociétés (« pros seulement pour le moment »). */
export class PlannerProOnlyError extends AuthorizationError {
  constructor() {
    super(
      "planner.pro_only",
      "Le planificateur de commandes est réservé aux espaces des sociétés : passez dans l'espace de votre société pour l'ouvrir.",
    );
  }
}

/** La personne n'est plus membre de la société de l'espace. */
export class PlannerMembershipLostError extends AuthorizationError {
  constructor(
    readonly companyId: string,
    companyName: string,
  ) {
    super(
      "planner.membership_lost",
      `Vous n'êtes plus membre de ${companyName} : son planificateur ne s'ouvre plus depuis votre compte.`,
    );
  }
}
