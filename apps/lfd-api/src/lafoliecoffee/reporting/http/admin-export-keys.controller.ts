import {
  type ExportReaderKeyView,
  type IssueExportReaderKeyPayload,
  issueExportReaderKeyPayloadSchema,
  type IssuedExportReaderKeyResponse,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { IntentKey } from "../../../platform/shared/http/intent-key.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import {
  IssueExportReaderKeyCommand,
  type IssuedExportReaderKey,
} from "../application/commands/issue-export-reader-key.command.js";
import { RevokeExportReaderKeyCommand } from "../application/commands/revoke-export-reader-key.command.js";
import { ListExportReaderKeysQuery } from "../application/queries/list-export-reader-keys.query.js";

/**
 * **Les clés de l'export des ventes** au back-office, sous `exports` (plan
 * `documentation/commandes/export/plan-export-des-ventes.md`, § 6.1) ; l'action
 * se déduit du verbe. Créer et révoquer sont des gestes par intention.
 */
@Controller("admin/export-keys")
@AdminSurface("exports")
export class AdminExportKeysController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /** Les clés, sans secret ni haché. */
  @Get()
  list(): Promise<ExportReaderKeyView[]> {
    return this.queries.execute<ListExportReaderKeysQuery, ExportReaderKeyView[]>(
      new ListExportReaderKeysQuery(),
    );
  }

  /** Crée une clé ; son secret est dans cette réponse et nulle part ailleurs. */
  @Post()
  issue(
    @Body(new ZodBody(issueExportReaderKeyPayloadSchema)) payload: IssueExportReaderKeyPayload,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
  ): Promise<IssuedExportReaderKeyResponse> {
    return this.commands.execute<IssueExportReaderKeyCommand, IssuedExportReaderKey>(
      new IssueExportReaderKeyCommand(payload, staffUserId, intentKey),
    );
  }

  /** Révoque une clé : elle n'ouvre plus rien dès l'appel suivant. */
  @Post(":id/revoke")
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(
    @Param("id") id: string,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
  ): Promise<void> {
    await this.commands.execute<RevokeExportReaderKeyCommand, void>(
      new RevokeExportReaderKeyCommand(id, staffUserId, intentKey),
    );
  }
}
