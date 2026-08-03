import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";

import { ListStaffUsersHandler } from "./application/list-staff-users.handler.js";
import {
  CreateStaffUserHandler,
  RemoveStaffUserHandler,
  UpdateStaffUserHandler,
} from "./application/staff-user.handlers.js";
import { StaffUserRepository } from "./domain/staff-user.repository.js";
import { AdminStaffUsersController } from "./http/admin-staff-users.controller.js";
import { PrismaStaffUserRepository } from "./infrastructure/prisma-staff-user.repository.js";

/**
 * **Annuaire staff** (back-office) — source de vérité locale des personnes qui
 * opèrent la suite + leur périmètre. Isolé : aucun couplage au domaine clients.
 * Le provisioning de connexion (Auth0) viendra dans un module dédié.
 */
@Module({
  imports: [CqrsModule],
  controllers: [AdminStaffUsersController],
  providers: [
    { provide: StaffUserRepository, useClass: PrismaStaffUserRepository },
    ListStaffUsersHandler,
    CreateStaffUserHandler,
    UpdateStaffUserHandler,
    RemoveStaffUserHandler,
  ],
})
export class StaffUsersModule {}
