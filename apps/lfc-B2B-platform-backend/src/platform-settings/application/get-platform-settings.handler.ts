import type { PlatformSettings } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { PlatformSettingsRepository } from "../domain/platform-settings.repository.js";
import { GetPlatformSettingsQuery } from "./get-platform-settings.query.js";

/** Sert la config plateforme (feature flags d'activation). Lecture pure. */
@QueryHandler(GetPlatformSettingsQuery)
export class GetPlatformSettingsHandler implements IQueryHandler<
  GetPlatformSettingsQuery,
  PlatformSettings
> {
  constructor(private readonly settings: PlatformSettingsRepository) {}

  execute(): Promise<PlatformSettings> {
    return this.settings.read();
  }
}
