import { Logger, Module, type OnModuleInit } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";

import { GetStaffMeHandler } from "./application/get-staff-me.handler.js";
import { ListStaffUsersHandler } from "./application/list-staff-users.handler.js";
import {
  CreateStaffUserHandler,
  RemoveStaffUserHandler,
  UpdateStaffUserHandler,
} from "./application/staff-user.handlers.js";
import { StaffUserRepository } from "./domain/staff-user.repository.js";
import { AdminMeController } from "./http/admin-me.controller.js";
import { AdminStaffUsersController } from "./http/admin-staff-users.controller.js";
import { PrismaStaffUserRepository } from "./infrastructure/prisma-staff-user.repository.js";

/**
 * **Annuaire staff** (back-office) — source de vérité locale des personnes qui
 * opèrent la suite + leur périmètre. Isolé : aucun couplage au domaine clients.
 * Le provisioning de connexion (Auth0) viendra dans un module dédié.
 *
 * Au boot, garantit l'**admin racine** (`ensureBootstrapAdmin`) : le 1er staff,
 * celui qui provisionne tous les autres. Il réapparaît même supprimé en base, et
 * la garde du repo interdit sa suppression/rétrogradation.
 */
@Module({
  imports: [CqrsModule],
  controllers: [AdminStaffUsersController, AdminMeController],
  providers: [
    { provide: StaffUserRepository, useClass: PrismaStaffUserRepository },
    ListStaffUsersHandler,
    GetStaffMeHandler,
    CreateStaffUserHandler,
    UpdateStaffUserHandler,
    RemoveStaffUserHandler,
  ],
})
export class StaffUsersModule implements OnModuleInit {
  private readonly logger = new Logger(StaffUsersModule.name);

  constructor(private readonly staff: StaffUserRepository) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.staff.ensureBootstrapAdmin();
    } catch (error) {
      // On ne bloque PAS le boot : la garde anti-suppression + le prochain boot
      // ré-assurent l'admin racine. Un souci transitoire (db) ne tue pas l'API.
      this.logger.error("ensureBootstrapAdmin a échoué", error);
    }
  }
}
