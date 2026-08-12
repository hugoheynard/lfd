import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { StaffUserRepository } from "../domain/staff-user.repository.js";
import {
  CreateStaffUserCommand,
  RemoveStaffUserCommand,
  UpdateStaffUserCommand,
} from "./staff-user.commands.js";

/**
 * Handlers **staff** de l'annuaire. Minces : ils délèguent au repository, qui
 * rassemble les faits et laisse la politique de domaine trancher
 * (`staff-access.policy.ts`). Le mur d'entrée est l'`AdminAuthGuard` sur la route.
 */

@CommandHandler(CreateStaffUserCommand)
export class CreateStaffUserHandler implements ICommandHandler<CreateStaffUserCommand, string> {
  constructor(private readonly staff: StaffUserRepository) {}

  execute(command: CreateStaffUserCommand): Promise<string> {
    return this.staff.create(command.payload, command.actorSub);
  }
}

@CommandHandler(UpdateStaffUserCommand)
export class UpdateStaffUserHandler implements ICommandHandler<UpdateStaffUserCommand, void> {
  constructor(private readonly staff: StaffUserRepository) {}

  async execute(command: UpdateStaffUserCommand): Promise<void> {
    await this.staff.update(command.id, command.payload, command.actorSub);
  }
}

@CommandHandler(RemoveStaffUserCommand)
export class RemoveStaffUserHandler implements ICommandHandler<RemoveStaffUserCommand, void> {
  constructor(private readonly staff: StaffUserRepository) {}

  async execute(command: RemoveStaffUserCommand): Promise<void> {
    await this.staff.remove(command.id, command.actorSub);
  }
}
