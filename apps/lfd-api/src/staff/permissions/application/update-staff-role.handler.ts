import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { Journal } from "../../../platform/journal/journal.js";
import { roleUpdatedFact } from "../domain/staff-role-facts.js";
import { StaffRoleRepository } from "../domain/staff-role.repository.js";
import { loadEditableRole } from "./staff-role-support.js";
import { UpdateStaffRoleCommand } from "./staff-role.commands.js";

/**
 * Réécrit un rôle. Le fait dit ce qui a changé — libellé, droits ajoutés,
 * retirés, modifiés —, et une redéfinition identique n'en écrit aucun.
 */
@CommandHandler(UpdateStaffRoleCommand)
export class UpdateStaffRoleHandler implements ICommandHandler<UpdateStaffRoleCommand, void> {
  constructor(
    private readonly roles: StaffRoleRepository,
    private readonly journal: Journal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: UpdateStaffRoleCommand): Promise<void> {
    const role = await loadEditableRole(this.roles, command.key);
    const before = role.toPersistence();
    role.redefine(command.payload);
    await this.uow.run(async () => {
      await this.roles.save(role);
      const fact = roleUpdatedFact(before, role.toPersistence());
      if (fact !== null) {
        await this.journal.append(fact);
      }
    });
  }
}
