import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../platform/shared/errors/app-error.js";

export class InvalidStaffRoleError extends DomainError {
  constructor(
    readonly field: string,
    readonly reason: string,
  ) {
    super("staff.role.invalid", `${field} : ${reason}`);
  }
}

/**
 * Le sommet ne se redéfinit pas.
 *
 * `superadmin` vit dans le code et n'accorde pas une matrice mais **tout**, par
 * court-circuit. Une ligne homonyme en base créerait deux réponses à « que peut
 * le sommet », et la réponse modifiable gagnerait — c'est-à-dire qu'on pourrait
 * condamner l'issue de secours depuis un écran.
 */
export class ReservedStaffRoleKeyError extends BusinessError {
  constructor(readonly key: string) {
    super(
      "staff.role.key_reserved",
      `« ${key} » est réservé au rôle interne qui garantit qu'on ne peut pas se ` +
        `verrouiller dehors. Choisissez une autre clé.`,
    );
  }
}

export class StaffRoleKeyAlreadyUsedError extends BusinessError {
  constructor(readonly key: string) {
    super(
      "staff.role.key_taken",
      `Un rôle porte déjà la clé « ${key} ». Ouvrez-le pour en modifier les droits, ` +
        `ou choisissez une autre clé.`,
    );
  }
}

/**
 * Un rôle que des gens portent ne s'archive pas.
 *
 * L'archiver les laisserait avec un rôle qui n'existe plus : à la prochaine
 * résolution, ils n'auraient plus aucun droit — sans qu'aucun écran ne l'ait
 * annoncé, et sans que personne ne comprenne pourquoi tout renvoie 403.
 */
export class StaffRoleStillHeldError extends BusinessError {
  constructor(
    readonly key: string,
    readonly memberCount: number,
  ) {
    super(
      "staff.role.still_held",
      `${memberCount} personne${memberCount > 1 ? "s portent" : " porte"} encore le rôle ` +
        `« ${key} ». Donnez-leur un autre rôle avant de l'archiver.`,
    );
  }
}

export class StaffRoleNotFoundError extends ResourceNotFoundError {
  constructor(readonly key: string) {
    super("staff.role.not_found", `Aucun rôle « ${key} ».`);
  }
}
