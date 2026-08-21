import { Controller, Get, Query } from "@nestjs/common";

import {
  allergenReference,
  type AllergenReference,
} from "../../../allergens/allergen-reference.js";
import { AdminSurface } from "../../../../platform/auth/admin-surface.decorator.js";

/**
 * Surface staff murée par `@AdminSurface("catalog")` : identité vérifiée
 * contre l'annuaire, puis périmètre. Elle a été **ouverte** tant que le
 * référentiel vivait dans son propre processus — un jeton Auth0 valide
 * suffisait, et un révoqué gardait la main sur le catalogue.
 */
@AdminSurface("catalog")
@Controller("reference")
export class ReferenceController {
  /**
   * Référentiel des allergènes. `scope=eu` (défaut) = la liste **légale** ;
   * `scope=world` = la liste **interopérable**, codes hors UE compris.
   */
  @Get("allergens")
  allergens(@Query("scope") scope?: string): AllergenReference {
    return allergenReference(scope === "world" ? "world" : "eu", "fr");
  }
}
