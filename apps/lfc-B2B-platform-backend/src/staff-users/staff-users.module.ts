import { Logger, Module, type OnModuleInit } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";

import { AppConfig } from "../infra/config/app-config.js";
import { GetStaffMeHandler } from "./application/get-staff-me.handler.js";
import { InviteStaffUserHandler } from "./application/invite-staff-user.handler.js";
import { ListStaffUsersHandler } from "./application/list-staff-users.handler.js";
import {
  CreateStaffUserHandler,
  RemoveStaffUserHandler,
  SetStaffStatusHandler,
  UpdateStaffUserHandler,
} from "./application/staff-user.handlers.js";
import { StaffIdentityPort } from "./domain/staff-identity.port.js";
import { StaffUserRepository } from "./domain/staff-user.repository.js";
import { Auth0StaffIdentity } from "./infrastructure/auth0-staff-identity.js";
import { DevStaffIdentity } from "./infrastructure/dev-staff-identity.js";
import { AdminMeController } from "./http/admin-me.controller.js";
import { AdminStaffUsersController } from "./http/admin-staff-users.controller.js";
import { PrismaStaffUserRepository } from "./infrastructure/prisma-staff-user.repository.js";

/**
 * **Annuaire staff** (back-office) — source de vérité locale des personnes qui
 * opèrent la suite + leur périmètre. Isolé : aucun couplage au domaine clients —
 * il partage la mécanique d'identité (`IdentityModule`), pas leurs contrats.
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
    SetStaffStatusHandler,
    InviteStaffUserHandler,
    {
      // Même arbitrage que côté client, et pour la même raison : le double de
      // dev n'apparaît QUE si le canal réel n'est pas configuré ET qu'on n'est
      // pas en production. En prod sans M2M, l'adaptateur Auth0 reste et refuse
      // clairement — on ne fabrique pas d'accès fantôme au back-office.
      provide: StaffIdentityPort,
      inject: [AppConfig, Auth0StaffIdentity, DevStaffIdentity],
      useFactory: (
        config: AppConfig,
        auth0: Auth0StaffIdentity,
        dev: DevStaffIdentity,
      ): StaffIdentityPort => {
        const configured = config.auth0ManagementCredentials() !== null;
        return configured || config.isProduction() ? auth0 : dev;
      },
    },
    Auth0StaffIdentity,
    DevStaffIdentity,
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
