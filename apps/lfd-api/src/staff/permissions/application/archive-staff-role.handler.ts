import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { Journal } from "../../../platform/journal/journal.js";
import { Clock } from "../../../platform/time/clock.js";
import { roleArchivedFact } from "../domain/staff-role-facts.js";
import { StaffRoleRepository } from "../domain/staff-role.repository.js";
import { loadEditableRole } from "./staff-role-support.js";
import { ArchiveStaffRoleCommand } from "./staff-role.commands.js";

/** Archive un rôle — l'agrégat refuse si des gens le portent encore. */
@CommandHandler(ArchiveStaffRoleCommand)
export class ArchiveStaffRoleHandler implements ICommandHandler<ArchiveStaffRoleCommand, void> {
  constructor(
    private readonly roles: StaffRoleRepository,
    private readonly clock: Clock,
    private readonly journal: Journal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ArchiveStaffRoleCommand): Promise<void> {
    const role = await loadEditableRole(this.roles, command.key);
    const before = role.toPersistence();
    role.archive(this.clock.now(), await this.roles.memberCount(command.key));
    await this.uow.run(async () => {
      await this.roles.save(role);
      const fact = roleArchivedFact(before);
      if (fact !== null) {
        await this.journal.append(fact);
      }
    });
  }
}
