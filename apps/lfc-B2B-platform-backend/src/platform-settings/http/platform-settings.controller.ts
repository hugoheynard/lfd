import type { PlatformSettings } from "@lfd/contracts";
import { Controller, Get } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { Public } from "../../infra/auth/public.decorator.js";
import { GetPlatformSettingsQuery } from "../application/get-platform-settings.query.js";

/**
 * Lecture **publique** des réglages plateforme — de simples *feature flags*
 * d'activation (quelles pièces existent / sont requises). Non sensible : le
 * client comme l'admin en ont besoin pour masquer les pièces `hidden`, donc
 * `@Public()` désarme le guard client (le staff n'a pas de token client) et la
 * route ne demande aucune authentification. L'**écriture** reste staff-only
 * ({@link AdminPlatformSettingsController}).
 */
@Controller("platform-settings")
@Public()
export class PlatformSettingsController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  read(): Promise<PlatformSettings> {
    return this.queries.execute<GetPlatformSettingsQuery, PlatformSettings>(
      new GetPlatformSettingsQuery(),
    );
  }
}
