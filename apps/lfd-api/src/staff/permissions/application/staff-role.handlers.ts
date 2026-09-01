import {
  CommandHandler,
  QueryHandler,
  type ICommandHandler,
  type IQueryHandler,
} from "@nestjs/cqrs";
import { isSuperAdminRoleKey, type StaffRoleView } from "@lfd/contracts";

import { Clock } from "../../../platform/time/clock.js";
import { StaffRoleDefinition } from "../domain/staff-role-definition.js";
import {
  ReservedStaffRoleKeyError,
  StaffRoleKeyAlreadyUsedError,
  StaffRoleNotFoundError,
} from "../domain/staff-role-errors.js";
import { StaffRoleReader } from "../domain/staff-role.reader.js";
import { StaffRoleRepository } from "../domain/staff-role.repository.js";
import { ListStaffRolesQuery } from "./list-staff-roles.query.js";
import {
  ArchiveStaffRoleCommand,
  CreateStaffRoleCommand,
  RestoreStaffRoleCommand,
  UpdateStaffRoleCommand,
} from "./staff-role.commands.js";

/**
 * Définit un rôle.
 *
 * Le doublon est refusé **lisiblement** ici alors que l'index unique le tient
 * déjà : le mur reste la contrainte — deux créations concurrentes passeraient
 * toutes deux ce contrôle — mais un back-office lu par du personnel ne doit pas
 * afficher une violation de contrainte Postgres.
 */
@CommandHandler(CreateStaffRoleCommand)
export class CreateStaffRoleHandler implements ICommandHandler<CreateStaffRoleCommand, string> {
  constructor(private readonly roles: StaffRoleRepository) {}

  async execute(command: CreateStaffRoleCommand): Promise<string> {
    const role = StaffRoleDefinition.define(command.payload);
    if ((await this.roles.load(role.key)) !== null) {
      throw new StaffRoleKeyAlreadyUsedError(role.key);
    }
    await this.roles.save(role);
    return role.key;
  }
}

/**
 * Réécrit un rôle.
 *
 * `superadmin` est refusé **avant** la lecture : il n'a pas de ligne, donc un
 * simple `load` rendrait « rôle introuvable » — un message qui laisserait croire
 * à une faute de frappe alors que la réponse est « celui-là ne se modifie pas ».
 */
@CommandHandler(UpdateStaffRoleCommand)
export class UpdateStaffRoleHandler implements ICommandHandler<UpdateStaffRoleCommand, void> {
  constructor(private readonly roles: StaffRoleRepository) {}

  async execute(command: UpdateStaffRoleCommand): Promise<void> {
    const role = await loadEditable(this.roles, command.key);
    role.redefine(command.payload);
    await this.roles.save(role);
  }
}

/** Archive un rôle — l'agrégat refuse si des gens le portent encore. */
@CommandHandler(ArchiveStaffRoleCommand)
export class ArchiveStaffRoleHandler implements ICommandHandler<ArchiveStaffRoleCommand, void> {
  constructor(
    private readonly roles: StaffRoleRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: ArchiveStaffRoleCommand): Promise<void> {
    const role = await loadEditable(this.roles, command.key);
    role.archive(this.clock.now(), await this.roles.memberCount(command.key));
    await this.roles.save(role);
  }
}

/** Remet un rôle archivé en circulation. */
@CommandHandler(RestoreStaffRoleCommand)
export class RestoreStaffRoleHandler implements ICommandHandler<RestoreStaffRoleCommand, void> {
  constructor(private readonly roles: StaffRoleRepository) {}

  async execute(command: RestoreStaffRoleCommand): Promise<void> {
    const role = await loadEditable(this.roles, command.key);
    role.restore();
    await this.roles.save(role);
  }
}

/** Tous les rôles, `superadmin` compris — cf. {@link StaffRoleReader}. */
@QueryHandler(ListStaffRolesQuery)
export class ListStaffRolesHandler implements IQueryHandler<
  ListStaffRolesQuery,
  readonly StaffRoleView[]
> {
  constructor(private readonly roles: StaffRoleReader) {}

  execute(): Promise<readonly StaffRoleView[]> {
    return this.roles.list();
  }
}

/**
 * Le rôle, s'il est modifiable. Partagé par les trois mutations parce que les
 * deux refus sont les mêmes partout — et qu'un troisième handler qui oublierait
 * le premier rendrait `superadmin` archivable.
 *
 * @throws {ReservedStaffRoleKeyError} c'est le sommet, il vit dans le code.
 * @throws {StaffRoleNotFoundError} aucune ligne pour cette clé.
 */
async function loadEditable(roles: StaffRoleRepository, key: string): Promise<StaffRoleDefinition> {
  if (isSuperAdminRoleKey(key)) {
    throw new ReservedStaffRoleKeyError(key);
  }
  const role = await roles.load(key);
  if (role === null) {
    throw new StaffRoleNotFoundError(key);
  }
  return role;
}
