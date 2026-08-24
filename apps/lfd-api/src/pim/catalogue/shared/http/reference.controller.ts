import { Controller, Get, Query } from "@nestjs/common";

import type { SalesContextView } from "@lfd/pim-contracts";

import {
  allergenReference,
  type AllergenReference,
} from "../../../allergens/allergen-reference.js";
import { AdminSurface } from "../../../../platform/auth/admin-surface.decorator.js";
import { SalesContextRegistry } from "../domain/ports/sales-context.registry.js";

/**
 * Surface staff murée par `@AdminSurface("catalog")` : identité vérifiée
 * contre l'annuaire, puis périmètre. Elle a été **ouverte** tant que le
 * référentiel vivait dans son propre processus — un jeton Auth0 valide
 * suffisait, et un révoqué gardait la main sur le catalogue.
 */
@AdminSurface("catalog")
@Controller("reference")
export class ReferenceController {
  constructor(private readonly contexts: SalesContextRegistry) {}

  /**
   * Les **contextes de vente** en service. L'écran en dérive ses lignes de
   * réglage : une ligne de plus en base est une ligne de plus à l'écran, sans
   * livrer de front. Le registre est en lecture seule — un contexte se pose par
   * migration, pas par formulaire.
   */
  @Get("sales-contexts")
  async salesContexts(): Promise<SalesContextView[]> {
    const contexts = await this.contexts.active();
    return contexts.map((context) => ({
      key: context.key,
      label: context.label,
      channelKey: context.channelKey,
      position: context.position,
    }));
  }

  /**
   * Référentiel des allergènes. `scope=eu` (défaut) = la liste **légale** ;
   * `scope=world` = la liste **interopérable**, codes hors UE compris.
   */
  @Get("allergens")
  allergens(@Query("scope") scope?: string): AllergenReference {
    return allergenReference(scope === "world" ? "world" : "eu", "fr");
  }
}
