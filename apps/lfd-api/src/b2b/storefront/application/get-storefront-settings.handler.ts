import type { StorefrontSettingsView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { StorefrontSettingsReader } from "../domain/storefront-settings.reader.js";
import { GetStorefrontSettingsQuery } from "./get-storefront-settings.query.js";

@QueryHandler(GetStorefrontSettingsQuery)
export class GetStorefrontSettingsHandler implements IQueryHandler<
  GetStorefrontSettingsQuery,
  StorefrontSettingsView
> {
  constructor(private readonly settings: StorefrontSettingsReader) {}

  async execute(): Promise<StorefrontSettingsView> {
    const setting = await this.settings.allergenDisplay();
    return {
      allergenDisplay: setting.allergenDisplay,
      updatedAt: setting.updatedAt === null ? null : setting.updatedAt.toISOString(),
    };
  }
}
