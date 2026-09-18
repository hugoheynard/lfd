import type { StaffUserPayload } from "@lfd/contracts";

/**
 * Commandes **staff** de gestion de l'annuaire des users staff.
 *
 * Chacune porte l'`actorId` — l'id de la **fiche** d'annuaire du staff qui
 * agit, jamais son `sub` Auth0 (plan `plan-journal-de-l-annuaire.md` D1). Il
 * sert deux fois : attribuer les dérogations posées, et reconnaître qu'on se
 * vise **soi-même** (on ne se retire pas ses propres droits d'administration).
 */

export class CreateStaffUserCommand {
  constructor(
    readonly payload: StaffUserPayload,
    readonly actorId: string,
  ) {}
}

export class UpdateStaffUserCommand {
  constructor(
    readonly id: string,
    readonly payload: StaffUserPayload,
    readonly actorId: string,
  ) {}
}

export class RemoveStaffUserCommand {
  constructor(
    readonly id: string,
    readonly actorId: string,
  ) {}
}

/**
 * Invite une personne, ou lui **renvoie** un lien : c'est le même geste, et le
 * serveur sait déjà lequel des deux s'applique. Deux commandes obligeraient
 * l'écran à deviner, et il se tromperait au premier second onglet ouvert.
 */
export class InviteStaffUserCommand {
  constructor(
    readonly id: string,
    readonly actorId: string,
  ) {}
}
