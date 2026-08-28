import {
  footerContentPayloadSchema,
  type FooterContentPayload,
  type FooterContentView,
} from "@lfd/contracts";
import { Body, Controller, Get, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { GetFooterContentQuery } from "../application/get-footer-content.query.js";
import { SaveFooterContentCommand } from "../application/save-footer-content.command.js";

/**
 * Édition **staff** du contenu de plateforme (back-office → Contenu plateforme).
 *
 * La lecture y est doublée alors qu'elle existe déjà en public, et c'est
 * volontaire : l'écran d'édition doit connaître la RÉVISION et la dernière
 * main, que la surface publique n'a aucune raison de porter au client.
 *
 * `PUT` et non `PATCH` : on enregistre le pied de page ENTIER, dans ses trois
 * langues. Un enregistrement partiel laisserait une langue en arrière sans que
 * rien ne le dise — exactement ce que le contrat cherche à rendre impossible.
 */
@Controller("admin/content")
@AdminSurface("settings")
export class AdminPlatformContentController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  @Get("footer")
  footer(): Promise<FooterContentView> {
    return this.queries.execute<GetFooterContentQuery, FooterContentView>(
      new GetFooterContentQuery(),
    );
  }

  @Put("footer")
  saveFooter(
    @Body(new ZodBody(footerContentPayloadSchema)) payload: FooterContentPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<FooterContentView> {
    return this.commands.execute<SaveFooterContentCommand, FooterContentView>(
      new SaveFooterContentCommand(payload, staffUserId),
    );
  }
}
