import { Controller, Get, Query } from "@nestjs/common";

import {
  allergenReference,
  type AllergenReference,
} from "../../../allergens/allergen-reference.js";
import { AdminSurface } from "../../../../platform/auth/admin-surface.decorator.js";

/**
 * Le référentiel des **allergènes** — une liste légale, statique, sans base.
 *
 * Il servait aussi les contextes de vente ; ceux-ci ont rejoint leur propre
 * module. Ce qui reste a UN consommateur, la fiche produit, et le catalogue est
 * le seul à en avoir besoin : il reste donc ici plutôt que de gagner un module
 * pour un endpoint qui rend une constante.
 *
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
