import { Controller, Get } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import type { AudienceSwitchPreviewView } from "@lfd/pim-contracts";

import { AdminSurface } from "../../../../platform/auth/admin-surface.decorator.js";
import { GetAudienceSwitchPreviewQuery } from "../application/audience-switch-preview.js";

/**
 * **L'aperçu de la bascule vers l'audience** — `GET
 * /pim/channels/b2b/audience-switch-preview`.
 *
 * ⚠️ Le plan la nomme `/pim/catalogue/audience-switch-preview` ; elle vit ici
 * parce qu'elle lit le lien au canal, et que le catalogue n'importe pas ses
 * canaux (ADR-13).
 *
 * Surface murée par `@AdminSurface("pim_catalog")` : un `GET`, donc la
 * permission de LECTURE du référentiel — c'est une mesure, pas un geste sur
 * le canal.
 */
@AdminSurface("pim_catalog")
@Controller("audience-switch-preview")
export class AudienceSwitchPreviewController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  preview(): Promise<AudienceSwitchPreviewView> {
    return this.queries.execute<GetAudienceSwitchPreviewQuery, AudienceSwitchPreviewView>(
      new GetAudienceSwitchPreviewQuery(),
    );
  }
}
