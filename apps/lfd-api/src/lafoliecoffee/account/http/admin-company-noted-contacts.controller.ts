import { noteCompanyContactPayloadSchema, type NoteCompanyContactPayload } from "@lfd/contracts";
import { Body, Controller, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { IntentKey } from "../../../platform/shared/http/intent-key.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { NoteCompanyContactCommand } from "../application/commands/note-company-contact.command.js";

/**
 * **Noter un contact** sur la fiche d'une société, côté staff : l'échange
 * (mode, jour, note courte) qui fait d'une ligne d'annuaire une fiche
 * « Contactée » du suivi commercial.
 *
 * Distinct du carnet des interlocuteurs (`contacts`) : celui-ci range des
 * personnes, celui-là des échanges.
 */
@Controller("admin/companies/:companyId")
@AdminSurface("b2b_companies")
export class AdminCompanyNotedContactsController {
  constructor(private readonly commands: CommandBus) {}

  /** Un échange de plus — une fois par intention (`Idempotency-Key`). */
  @Post("noted-contacts")
  @HttpCode(HttpStatus.CREATED)
  async note(
    @Param("companyId") companyId: string,
    @Body(new ZodBody(noteCompanyContactPayloadSchema)) payload: NoteCompanyContactPayload,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
  ): Promise<void> {
    await this.commands.execute<NoteCompanyContactCommand, void>(
      new NoteCompanyContactCommand(
        companyId,
        payload.mode,
        payload.date,
        payload.note,
        staffUserId,
        intentKey,
      ),
    );
  }
}
