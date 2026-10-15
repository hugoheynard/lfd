import type { CreateStaffRolePayload, UpdateStaffRolePayload } from "@lfd/contracts";

/** Définit un rôle neuf. La clé est frappée ici, et ne bougera plus. */
export class CreateStaffRoleCommand {
  constructor(readonly payload: CreateStaffRolePayload) {}
}

/**
 * Réécrit le libellé et les droits d'un rôle. La clé n'en fait pas partie.
 *
 * `actorId` — l'id de FICHE de l'auteur : on ne se retire pas l'annuaire en
 * éditant le rôle qu'on porte (plan `plan-roles-lus-en-base.md` §3.3).
 *
 * `agentTool` — l'outil agent qui a écrit (en-tête `x-lfd-agent-tool`), ou
 * `null` depuis l'écran. Une trace pour le journal, jamais une autorisation.
 */
export class UpdateStaffRoleCommand {
  constructor(
    readonly key: string,
    readonly payload: UpdateStaffRolePayload,
    readonly actorId: string,
    readonly agentTool: string | null = null,
  ) {}
}

/** Retire un rôle de la circulation. Refusé tant que des gens le portent. */
export class ArchiveStaffRoleCommand {
  constructor(readonly key: string) {}
}

/** Remet un rôle archivé en circulation. */
export class RestoreStaffRoleCommand {
  constructor(readonly key: string) {}
}
