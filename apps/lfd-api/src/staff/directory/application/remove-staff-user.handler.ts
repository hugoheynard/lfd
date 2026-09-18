import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { Journal } from "../../../platform/journal/journal.js";
import { StaffAccessCache } from "../../permissions/staff-access-cache.port.js";
import { staffUserDeletedFact } from "../domain/staff-facts.js";
import { StaffUserRepository } from "../domain/staff-user.repository.js";
import { RemoveStaffUserCommand } from "./staff-user.commands.js";

/**
 * Supprime une fiche — et **fige qui elle était** dans la trace : une fois la
 * ligne partie, le journal est le seul endroit qui sache encore la nommer.
 *
 * La suppression et son fait partent ensemble ; le cache d'accès est oublié
 * après le commit.
 */
@CommandHandler(RemoveStaffUserCommand)
export class RemoveStaffUserHandler implements ICommandHandler<RemoveStaffUserCommand, void> {
  constructor(
    private readonly staff: StaffUserRepository,
    private readonly journal: Journal,
    private readonly uow: UnitOfWork,
    private readonly cache: StaffAccessCache,
  ) {}

  async execute(command: RemoveStaffUserCommand): Promise<void> {
    await this.uow.run(async () => {
      const removed = await this.staff.remove(command.id, command.actorId);
      await this.journal.append(staffUserDeletedFact(command.id, removed));
    });
    this.cache.forgetAll();
  }
}
