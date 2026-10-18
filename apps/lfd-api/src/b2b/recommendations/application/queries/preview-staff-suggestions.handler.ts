import {
  instantToLocal,
  type CartSuggestionView,
  type StaffSuggestionPreviewView,
} from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import type { ShopAudience } from "../../../catalog/domain/ports/catalog.reader.js";
import type { FulfillmentTarget } from "../../domain/orderable-today.js";
import { CartFamilyReader } from "../../domain/ports/cart-family.reader.js";
import { BOUGHT_WITH_CART_PLACES } from "../../domain/services/bought-with.js";
import { cartTriggering, STAFF_CART_PLACES } from "../../domain/services/cart-suggestions.js";
import { homeTriggering, STAFF_HOME_PLACES } from "../../domain/services/home-suggestions.js";
import {
  productTriggering,
  STAFF_PRODUCT_PLACES,
} from "../../domain/services/product-suggestions.js";
import { shopSiteOf } from "../../domain/services/suggestion-conditions-gate.js";
import type { SuggestionTriggering } from "../../domain/services/suggestion-candidates.js";
import { BoughtWithShowcase } from "../services/bought-with-showcase.js";
import {
  StaffSuggestionShowcase,
  type ShowcaseDiagnosis,
} from "../services/staff-suggestion-showcase.js";
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
 * boutique ouverte ce jour-là pour ce jour-là. L'heure choisie (sinon celle de
 * maintenant) juge les créneaux de RS8, le montant donné le seuil de panier.
 *
 * Sans société : à un pro, la vitrine pro sans tarif de société.
 *
 * Au panier, le calculé (R2, `BoughtWithShowcase`) suit le décidé, comme en
 * boutique : sa fenêtre finit aujourd'hui, le jour choisi ne sert qu'à son
 * heure limite. Il n'a pas de règle, donc rien à diagnostiquer : il paraît
 * dans `shown`, avec sa raison.
 */
@QueryHandler(PreviewStaffSuggestionsQuery)
export class PreviewStaffSuggestionsHandler implements IQueryHandler<
  PreviewStaffSuggestionsQuery,
  StaffSuggestionPreviewView
> {
  constructor(
    private readonly showcase: StaffSuggestionShowcase,
    private readonly boughtWith: BoughtWithShowcase,
    private readonly families: CartFamilyReader,
    private readonly clock: Clock,
  ) {}

  async execute(query: PreviewStaffSuggestionsQuery): Promise<StaffSuggestionPreviewView> {
    const now = instantToLocal(this.clock.now());
    const day = query.day ?? now.day;
    const time = query.time ?? now.time;
    const { place } = query;
    const target: FulfillmentTarget = { date: day, pickupAddressId: query.pickupAddressId };
    const diagnosis = await this.showcase.diagnose({
      placement: place.placement,
      audience: query.audience,
      day,
      time,
      inCart: query.skus,
      target,
      // Sans point choisi, l'aperçu joue le client qui n'a pas encore choisi :
      // l'heure limite suit la règle générale, une règle à points ne paraît pas.
      site: shopSiteOf(
        query.pickupAddressId === null
          ? null
          : { date: day, pickupAddressId: query.pickupAddressId },
      ),
      cartTotalCents: place.placement === "cart" ? query.cartTotalCents : null,
      ...this.setupOf(place, query.skus),
    });
    const computed = await this.computedOf(query, target, diagnosis);
    return staffSuggestionPreviewView(day, time, diagnosis, computed);
  }

  /** Le calculé du panier — rien ailleurs : la fiche et l'accueil n'en ont pas encore. */
  private computedOf(
    query: PreviewStaffSuggestionsQuery,
    target: FulfillmentTarget,
    diagnosis: ShowcaseDiagnosis,
  ): Promise<readonly CartSuggestionView[]> {
    if (query.place.placement !== "cart") {
      return Promise.resolve([]);
    }
    return this.boughtWith.show({
      companyId: null,
      audience: query.audience,
      inCart: query.skus,
      taken: diagnosis.shown.map((view) => view.sku),
      target,
      places: BOUGHT_WITH_CART_PLACES,
    });
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
