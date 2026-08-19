import { Logger, Module, type OnModuleInit } from "@nestjs/common";

import { AppConfig } from "../platform/config/app-config.js";
import { StartupReport } from "../platform/startup/startup-report.service.js";
import { GetStaffMeHandler } from "./directory/application/get-staff-me.handler.js";
import { InviteStaffUserHandler } from "./invitations/invite-staff-user.handler.js";
import { OpenStaffAccess } from "./invitations/open-staff-access.service.js";
import { ListStaffUsersHandler } from "./directory/application/list-staff-users.handler.js";
import {
  CreateStaffUserHandler,
  RemoveStaffUserHandler,
  SetStaffStatusHandler,
  UpdateStaffUserHandler,
} from "./directory/application/staff-user.handlers.js";
import { PrismaStaffAccessResolver } from "./permissions/prisma-staff-access.resolver.js";
import { StaffAccessCache } from "./permissions/staff-access-cache.port.js";
import { StaffIdentityPort } from "./invitations/staff-identity.port.js";
import { StaffUserRepository } from "./directory/domain/staff-user.repository.js";
import { Auth0StaffIdentity } from "./invitations/auth0-staff-identity.js";
import { DevStaffIdentity } from "./invitations/dev-staff-identity.js";
import { AdminMeController } from "./directory/http/admin-me.controller.js";
import { AdminStaffAccessPendingController } from "./invitations/admin-staff-access-pending.controller.js";
import { PendingStaffAccessReader } from "./invitations/pending-staff-access.reader.js";
import { PrismaPendingStaffAccessReader } from "./invitations/prisma-pending-staff-access.reader.js";
import {
  IssueStaffPasswordLinkHandler,
  ListPendingStaffAccessHandler,
} from "./invitations/pending-staff-access.js";
import { AdminStaffUsersController } from "./directory/http/admin-staff-users.controller.js";
import { PrismaStaffUserRepository } from "./directory/infrastructure/prisma-staff-user.repository.js";

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
  controllers: [AdminStaffUsersController, AdminStaffAccessPendingController, AdminMeController],
  providers: [
    { provide: PendingStaffAccessReader, useClass: PrismaPendingStaffAccessReader },
    ListPendingStaffAccessHandler,
    IssueStaffPasswordLinkHandler,
    { provide: StaffUserRepository, useClass: PrismaStaffUserRepository },
    // L'adaptateur de résolution vit ICI, avec les tables qu'il lit ; c'est la
    // racine de composition qui le relie au port (cf. `StaffAccessModule`).
    PrismaStaffAccessResolver,
    // Le resolver EST le cache : il n'y en a qu'un, et l'annuaire ne le connaît
    // que par ce port étroit — il ne sait ni sa clé, ni sa durée de vie.
    { provide: StaffAccessCache, useExisting: PrismaStaffAccessResolver },
    ListStaffUsersHandler,
    GetStaffMeHandler,
    CreateStaffUserHandler,
    UpdateStaffUserHandler,
    RemoveStaffUserHandler,
    SetStaffStatusHandler,
    InviteStaffUserHandler,
    // Partagé par l'invitation ET la création — cf. son en-tête.
    OpenStaffAccess,
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
  // L'adaptateur sort pour que la racine puisse le relier au port.
  exports: [PrismaStaffAccessResolver],
})
export class StaffUsersModule implements OnModuleInit {
  private readonly logger = new Logger(StaffUsersModule.name);

  constructor(
    private readonly staff: StaffUserRepository,
    private readonly startup: StartupReport,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.staff.ensureBootstrapAdmin();
    } catch (error) {
      // On ne bloque PAS le boot : la garde anti-suppression + le prochain boot
      // ré-assurent l'admin racine. Un souci transitoire (db) ne tue pas l'API.
      this.logger.error("ensureBootstrapAdmin a échoué", error);
      // Mais on ne le garde pas pour nous non plus. Sans cette ligne, l'échec le
      // plus courant — une migration non appliquée — se manifeste plus tard par
      // un « Aucun accès » sur le compte administrateur, ce qui n'oriente vers
      // rien. Constaté le 2026-08-12, en production.
      this.startup.report({
        capability: "Porte de secours (admin racine)",
        setting: "BOOTSTRAP_ADMIN_EMAIL",
        consequence:
          "l'admin racine n'a pas pu être semé — cause la plus fréquente : une migration " +
          "non appliquée. Symptôme visible : « Aucun accès » à la connexion",
        severity: "blocking",
      });
    }
  }
}
