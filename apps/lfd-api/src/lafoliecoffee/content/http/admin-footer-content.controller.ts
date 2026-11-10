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
 * Édition **staff** du pied de page de la vitrine — sous `b2b_settings`.
 *
 * Coupé de l'édition des mentions le 2026-10-15 (plan
 * `legal/plan-cgv-par-audience.md`, C0) : les mentions passent sous
 * `lfc_legal`, le pied de page reste où il était. Même préfixe `admin/content`,
 * aucune adresse ne bouge.
 *
 * `PUT` et non `PATCH` : on enregistre le pied de page ENTIER, dans ses trois
 * langues. Un enregistrement partiel laisserait une langue en arrière sans que
 * rien ne le dise — exactement ce que le contrat cherche à rendre impossible.
 */
@Controller("admin/content")
@AdminSurface("b2b_settings")
export class AdminFooterContentController {
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
