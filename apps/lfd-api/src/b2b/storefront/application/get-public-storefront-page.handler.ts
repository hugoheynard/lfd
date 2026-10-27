import type { PublicStorefrontPageView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import { PublicStorefrontReader } from "../domain/public-storefront.reader.js";
import { StorefrontSettingsReader } from "../domain/storefront-settings.reader.js";
import { StorefrontOperationsReader } from "../domain/storefront-operations.reader.js";
import { GetPublicStorefrontPageQuery } from "./get-public-storefront-page.query.js";
import {
  hasOperationAnnouncements,
  resolveOperationAnnouncements,
} from "./operation-announcements.js";

/**
 * La page d'un rayon, ses annonces d'opération résolues à l'horloge du serveur
 * (D11). Les opérations ne se lisent que si la page en annonce une : la route
 * est anonyme, et hors saison aucune page n'en porte.
 */
@QueryHandler(GetPublicStorefrontPageQuery)
export class GetPublicStorefrontPageHandler implements IQueryHandler<
  GetPublicStorefrontPageQuery,
  PublicStorefrontPageView
> {
  constructor(
    private readonly reader: PublicStorefrontReader,
    private readonly operations: StorefrontOperationsReader,
    private readonly clock: Clock,
    private readonly settings: StorefrontSettingsReader,
  ) {}

  async execute(query: GetPublicStorefrontPageQuery): Promise<PublicStorefrontPageView> {
    const [page, setting] = await Promise.all([
      this.reader.pageOf(query.shelfKey),
      this.settings.allergenDisplay(),
    ]);
    const audience = query.companyId === null ? "public" : "pro";
    const shown = hasOperationAnnouncements(page)
      ? await this.operations.shownTo(audience, this.clock.now())
      : new Map();
    // La place des allergènes voyage sur TOUTE page (Hugo, 2026-10-27) : la
    // boutique la lit avec ce qu'elle charge déjà, sans appel de plus.
    return {
      ...resolveOperationAnnouncements(page, shown, query.shelfKey),
      allergenDisplay: setting.allergenDisplay,
    };
  }
}
