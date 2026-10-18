import { instantToLocal, type StaffSuggestionPreviewView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import type { ShopAudience } from "../../../catalog/domain/ports/catalog.reader.js";
import { CartFamilyReader } from "../../domain/ports/cart-family.reader.js";
import { cartTriggering, STAFF_CART_PLACES } from "../../domain/services/cart-suggestions.js";
import { homeTriggering, STAFF_HOME_PLACES } from "../../domain/services/home-suggestions.js";
import {
  productTriggering,
  STAFF_PRODUCT_PLACES,
} from "../../domain/services/product-suggestions.js";
import type { SuggestionTriggering } from "../../domain/services/suggestion-candidates.js";
import { StaffSuggestionShowcase } from "../services/staff-suggestion-showcase.js";
import {
  PreviewStaffSuggestionsQuery,
  type PreviewPlace,
} from "./preview-staff-suggestions.query.js";
import { staffSuggestionPreviewView } from "./staff-suggestion-preview-view.js";

/** Ce qu'un emplacement apporte à l'aperçu : sa place, et son déclencheur. */
interface PlaceSetup {
  readonly places: number;
  readonly triggeringOf: (audience: ShopAudience) => Promise<SuggestionTriggering>;
}

/**
 * L'aperçu passe par la vitrine commune (`StaffSuggestionShowcase.diagnose`),
 * avec le déclencheur et la place de l'emplacement choisi — ceux mêmes des
 * handlers de la boutique. Le jour choisi sert deux fois : la période des
 * règles s'y juge, et l'heure limite s'y oppose (jour visé), comme une
 * boutique ouverte ce jour-là pour ce jour-là.
 *
 * Sans société : à un pro, la vitrine pro sans tarif de société.
 */
@QueryHandler(PreviewStaffSuggestionsQuery)
export class PreviewStaffSuggestionsHandler implements IQueryHandler<
  PreviewStaffSuggestionsQuery,
  StaffSuggestionPreviewView
> {
  constructor(
    private readonly showcase: StaffSuggestionShowcase,
    private readonly families: CartFamilyReader,
    private readonly clock: Clock,
  ) {}

  async execute(query: PreviewStaffSuggestionsQuery): Promise<StaffSuggestionPreviewView> {
    const day = query.day ?? instantToLocal(this.clock.now()).day;
    const { place } = query;
    const diagnosis = await this.showcase.diagnose({
      placement: place.placement,
      audience: query.audience,
      day,
      inCart: query.skus,
      target: { date: day, pickupAddressId: query.pickupAddressId },
      ...this.setupOf(place, query.skus),
    });
    return staffSuggestionPreviewView(day, diagnosis);
  }

  /** La place et le déclencheur de chaque emplacement, ceux de son handler de boutique. */
  private setupOf(place: PreviewPlace, skus: readonly string[]): PlaceSetup {
    if (place.placement === "product") {
      const triggering = productTriggering(place.viewedSku);
      return { places: STAFF_PRODUCT_PLACES, triggeringOf: () => Promise.resolve(triggering) };
    }
    if (place.placement === "home") {
      return { places: STAFF_HOME_PLACES, triggeringOf: () => Promise.resolve(homeTriggering()) };
    }
    return {
      places: STAFF_CART_PLACES,
      triggeringOf: (audience) => this.cartTriggering(skus, audience),
    };
  }

  private async cartTriggering(
    skus: readonly string[],
    audience: ShopAudience,
  ): Promise<SuggestionTriggering> {
    const familyPaths = await this.families.pathsOf(skus, audience);
    return cartTriggering({ skus, familyPaths });
  }
}
