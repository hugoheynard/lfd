import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { Journal } from "../../../platform/journal/journal.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffAccessCache } from "../staff-access-cache.port.js";
import { roleArchivedFact } from "../domain/staff-role-facts.js";
import { StaffRoleRepository } from "../domain/staff-role.repository.js";
import { loadEditableRole } from "./staff-role-support.js";
import { ArchiveStaffRoleCommand } from "./staff-role.commands.js";

/**
 * Archive un rôle — l'agrégat refuse si des gens le portent encore.
 *
 * 🔴 Lecture, compte et écriture dans UNE transaction, la ligne du rôle sous
 * `FOR UPDATE` (plan `plan-roles-lus-en-base.md` §3.3). Hors transaction, une
 * attribution concurrente passait entre le compte et l'archivage : un rôle
 * archivé se retrouvait porté, et son porteur perdait tous ses droits. Une
 * attribution relit la définition sous `FOR SHARE` : l'une des deux attend
 * l'autre.
 *
 * Le cache d'accès est oublié APRÈS le commit : vidé avant, une requête
 * concurrente le remplirait avec l'état d'avant.
 */
@CommandHandler(ArchiveStaffRoleCommand)
export class ArchiveStaffRoleHandler implements ICommandHandler<ArchiveStaffRoleCommand, void> {
  constructor(
    private readonly roles: StaffRoleRepository,
    private readonly clock: Clock,
    private readonly journal: Journal,
    private readonly uow: UnitOfWork,
    private readonly cache: StaffAccessCache,
  ) {}

  async execute(command: ArchiveStaffRoleCommand): Promise<void> {
    await this.uow.run(async () => {
      const role = await loadEditableRole(this.roles, command.key, { forUpdate: true });
      const before = role.toPersistence();
      role.archive(this.clock.now(), await this.roles.memberCount(command.key));
      await this.roles.save(role);
      const fact = roleArchivedFact(before);
      if (fact !== null) {
        await this.journal.append(fact);
      }
    });
    this.cache.forgetAll();
  }
}
