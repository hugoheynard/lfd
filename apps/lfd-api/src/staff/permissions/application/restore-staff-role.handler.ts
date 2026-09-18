import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { Journal } from "../../../platform/journal/journal.js";
import { roleRestoredFact } from "../domain/staff-role-facts.js";
import { StaffRoleRepository } from "../domain/staff-role.repository.js";
import { loadEditableRole } from "./staff-role-support.js";
import { RestoreStaffRoleCommand } from "./staff-role.commands.js";

/** Remet un rôle archivé en circulation. */
@CommandHandler(RestoreStaffRoleCommand)
export class RestoreStaffRoleHandler implements ICommandHandler<RestoreStaffRoleCommand, void> {
  constructor(
    private readonly roles: StaffRoleRepository,
    private readonly journal: Journal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RestoreStaffRoleCommand): Promise<void> {
    const role = await loadEditableRole(this.roles, command.key);
    const before = role.toPersistence();
    role.restore();
    await this.uow.run(async () => {
      await this.roles.save(role);
      const fact = roleRestoredFact(before);
      if (fact !== null) {
        await this.journal.append(fact);
      }
    });
  }
}
