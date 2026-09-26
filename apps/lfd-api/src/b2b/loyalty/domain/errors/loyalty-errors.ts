import {
  AuthorizationError,
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus de la **fidélité**. Chaque message est lu par la comptabilité ou
 * par un client, sans le code sous les yeux : il nomme le cas réel et le geste
 * de sortie.
 */

/** Un ratio fait d'entiers strictement positifs — **400**. */
export class InvalidLoyaltyRatioError extends DomainError {
  constructor(pointsPerStep: number, stepValueCents: number) {
    super(
      "loyalty.invalid_ratio",
      `Ratio de fidélité invalide (${String(pointsPerStep)} points pour ${String(stepValueCents)} centimes) : ` +
        "les deux valeurs sont des nombres entiers strictement positifs.",
    );
  }
}

/** Une durée de validité en jours entiers, strictement positive — **400**. */
export class InvalidVoucherValidityError extends DomainError {
  constructor(days: number) {
    super(
      "loyalty.invalid_voucher_validity",
      `Durée de validité d'un bon invalide (${String(days)} jours) : saisissez un nombre entier de jours, au moins 1.`,
    );
  }
}

/**
 * Ouvrir la fidélité aux pros avant qu'on sache qu'une facture est réglée —
 * **409**. Chez un pro, `not_required` veut dire « payé à terme », pas encaissé :
 * sans ce signal, le programme créditerait des commandes non payées (plan des
 * points, lot F). L'écran ne le propose pas ; le serveur ne le croit pas.
 */
export class LoyaltyProNotYetOpenableError extends BusinessError {
  constructor() {
    super(
      "loyalty.pro_not_yet_openable",
      "La fidélité ne peut pas encore être ouverte aux professionnels : le logiciel ne sait pas " +
        "encore quand une facture à terme est réglée. Laissez la clientèle pro fermée.",
    );
  }
}

/** Le motif d'un geste du staff est vide ou trop long — **400**. */
export class InvalidLoyaltyReasonError extends DomainError {
  constructor(max: number) {
    super(
      "loyalty.invalid_reason",
      `Le motif est obligatoire et fait au plus ${String(max)} caractères : il dit, plus tard, pourquoi ce geste a été fait.`,
    );
  }
}

/** Un titulaire sans identifiant — **400**. Une faute de l'appelant, pas un cas métier. */
export class InvalidLoyaltyHolderError extends DomainError {
  constructor() {
    super(
      "loyalty.invalid_holder",
      "Titulaire de points invalide : une société ou une personne, désignée par son identifiant.",
    );
  }
}

/**
 * Un gain de commande nul, négatif ou fractionnaire — **400**. La base le
 * refuserait aussi (`CHECK`), mais sans dire pourquoi.
 */
export class InvalidEarnedPointsError extends DomainError {
  constructor(points: number) {
    super(
      "loyalty.invalid_earned_points",
      `Gain de fidélité invalide (${String(points)} points) : une commande rapporte un nombre entier de points, au moins 1.`,
    );
  }
}

/** On convertit par paliers entiers, au moins un — **400**. */
export class InvalidStepCountError extends DomainError {
  constructor(steps: number) {
    super(
      "loyalty.invalid_step_count",
      `Nombre de paliers invalide (${String(steps)}) : un bon se compose d'au moins un palier entier.`,
    );
  }
}

/** Un ajustement de zéro point — **400**. */
export class EmptyAdjustmentError extends DomainError {
  constructor() {
    super(
      "loyalty.empty_adjustment",
      "Un ajustement de zéro point ne change rien : saisissez un nombre de points à ajouter ou à retirer.",
    );
  }
}

/** Aucun réglage posé : le programme est fermé — **409**. */
export class LoyaltyProgramClosedError extends BusinessError {
  constructor() {
    super(
      "loyalty.program_closed",
      "Le programme de fidélité n'est pas encore ouvert : aucun ratio de conversion n'a été enregistré. " +
        "La comptabilité l'enregistre dans Comptabilité › Fidélité.",
    );
  }
}

/** Le programme n'est pas ouvert à cette clientèle — **409**. */
export class LoyaltyProgramClosedToClienteleError extends BusinessError {
  constructor(clientele: "public" | "pro") {
    super(
      "loyalty.program_closed_to_clientele",
      clientele === "pro"
        ? "Le programme de fidélité n'est pas ouvert aux clients professionnels : la conversion en bon est fermée pour les sociétés."
        : "Le programme de fidélité n'est pas ouvert aux particuliers pour le moment : la conversion en bon est fermée.",
    );
  }
}

/** Le solde ne couvre pas la conversion — **409**. */
export class InsufficientLoyaltyPointsError extends BusinessError {
  constructor(balance: number, cost: number) {
    super(
      "loyalty.insufficient_points",
      `Solde insuffisant : ce bon coûte ${String(cost)} points, et le solde n'en compte que ${String(balance)}. ` +
        "Choisissez un bon plus petit.",
    );
  }
}

/** Un retrait de points ferait passer le solde sous zéro — **409**. */
export class LoyaltyBalanceBelowZeroError extends BusinessError {
  constructor(balance: number, points: number) {
    super(
      "loyalty.balance_below_zero",
      `Impossible de retirer ${String(-points)} points : le solde n'en compte que ${String(balance)}, ` +
        "et il ne descend jamais sous zéro. Retirez au plus le solde.",
    );
  }
}

/** On n'annule qu'un bon disponible — **409**. */
export class LoyaltyVoucherNotAvailableError extends BusinessError {
  constructor(status: string) {
    super(
      "loyalty.voucher_not_available",
      `Ce bon n'est plus disponible (${STATUS_WORDS[status] ?? status}) : il n'y a plus rien à annuler.`,
    );
  }
}

/** Un bon passé sa date limite ne s'annule pas : ses points ne reviennent pas — **409**. */
export class LoyaltyVoucherExpiredError extends BusinessError {
  constructor(expiresAt: Date) {
    super(
      "loyalty.voucher_expired",
      `Ce bon a expiré le ${expiresAt.toISOString().slice(0, 10)} : il ne s'annule plus, et ses points ne reviennent pas. ` +
        "Pour dédommager le client, faites un ajustement motivé.",
    );
  }
}

/** Aucun bon sous cet identifiant — **404**. */
export class LoyaltyVoucherNotFoundError extends ResourceNotFoundError {
  constructor(id: string) {
    super("loyalty.voucher_not_found", `Aucun bon d'achat sous l'identifiant ${id}.`);
  }
}

/** Le titulaire n'existe pas — **404**. */
export class LoyaltyHolderNotFoundError extends ResourceNotFoundError {
  constructor(kind: "company" | "user", id: string) {
    super(
      "loyalty.holder_not_found",
      kind === "company"
        ? `Aucune société cliente sous l'identifiant ${id} : des points s'attachent à un client existant.`
        : `Aucune personne sous l'identifiant ${id} : des points s'attachent à un client existant.`,
    );
  }
}

/** La personne ne peut pas convertir pour ce titulaire — **403**. */
export class LoyaltyConversionForbiddenError extends AuthorizationError {
  constructor() {
    super(
      "loyalty.conversion_forbidden",
      "Vous ne pouvez pas convertir ces points : il faut être la personne titulaire, ou un membre actif de la société titulaire.",
    );
  }
}

const STATUS_WORDS: Readonly<Record<string, string>> = {
  expired: "expiré",
  cancelled: "déjà annulé",
};
