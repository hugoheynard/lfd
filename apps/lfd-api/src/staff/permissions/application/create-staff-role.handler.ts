import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { Journal } from "../../../platform/journal/journal.js";
import { StaffRoleDefinition } from "../domain/staff-role-definition.js";
import { StaffRoleKeyAlreadyUsedError } from "../domain/staff-role-errors.js";
import { roleCreatedFact } from "../domain/staff-role-facts.js";
import { StaffRoleRepository } from "../domain/staff-role.repository.js";
import { CreateStaffRoleCommand } from "./staff-role.commands.js";

/**
 * Définit un rôle — et sa trace part avec lui.
 *
 * Le doublon est refusé **lisiblement** ici alors que l'index unique le tient
 * déjà : le mur reste la contrainte — deux créations concurrentes passeraient
 * toutes deux ce contrôle — mais un back-office lu par du personnel ne doit pas
 * afficher une violation de contrainte Postgres.
 */
@CommandHandler(CreateStaffRoleCommand)
export class CreateStaffRoleHandler implements ICommandHandler<CreateStaffRoleCommand, string> {
  constructor(
    private readonly roles: StaffRoleRepository,
    private readonly journal: Journal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: CreateStaffRoleCommand): Promise<string> {
    const role = StaffRoleDefinition.define(command.payload);
    if ((await this.roles.load(role.key)) !== null) {
      throw new StaffRoleKeyAlreadyUsedError(role.key);
    }
    await this.uow.run(async () => {
      await this.roles.save(role);
      await this.journal.append(roleCreatedFact(role.toPersistence()));
    });
    return role.key;
  }
}
