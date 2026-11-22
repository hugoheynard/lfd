import { type ArchiveCompanyPayload, archiveCompanyPayloadSchema } from "@lfd/contracts";
import { Body, Controller, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { ArchiveCompanyCommand } from "../application/commands/archive-company.command.js";
import { UnarchiveCompanyCommand } from "../application/commands/unarchive-company.command.js";

/**
 * **Supprimer un compte, et le rendre** — la zone de danger de la fiche client.
 * Une suppression est un archivage : rien n'est effacé, le statut ne bouge pas.
 *
 * Même surface et même droit que la suspension et la résiliation
 * (`b2b_companies`, en écriture par le verbe) : ce sont les gestes de fin de vie
 * du même compte. Le contrôleur ne fait que le transport.
 */
@Controller("admin/companies")
@AdminSurface("b2b_companies")
export class AdminCompanyArchiveController {
  constructor(private readonly commands: CommandBus) {}

  /** Supprime un compte qui n'a jamais commandé ; le motif est obligatoire. */
  @Post(":companyId/archive")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent(
    "supprime un compte : rejouée, le compte est déjà supprimé et le geste est refusé sans rien écrire",
  )
  async archive(
    @Param("companyId") companyId: string,
    @Body(new ZodBody(archiveCompanyPayloadSchema)) payload: ArchiveCompanyPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<ArchiveCompanyCommand, void>(
      new ArchiveCompanyCommand(companyId, payload.reason, staffUserId),
    );
  }

  /** Rend un compte supprimé : il revient dans les listes, son statut intact. */
  @Post(":companyId/unarchive")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent(
    "rend un compte supprimé : rejouée, le compte n'est plus supprimé et le geste est refusé sans rien écrire",
  )
  async unarchive(@Param("companyId") companyId: string): Promise<void> {
    await this.commands.execute<UnarchiveCompanyCommand, void>(
      new UnarchiveCompanyCommand(companyId),
    );
  }
}
