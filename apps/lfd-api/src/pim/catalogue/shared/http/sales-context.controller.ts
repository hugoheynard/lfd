import { Controller, Get } from "@nestjs/common";

import type { SalesContextAdminView } from "@lfd/pim-contracts";

import { AdminSurface } from "../../../../platform/auth/admin-surface.decorator.js";
import { isRootContext } from "../domain/value-objects/bootstrap-contexts.js";
import { SalesContextRegistry } from "../domain/ports/sales-context.registry.js";

/**
 * Les **contextes de vente**, vus depuis l'administration.
 *
 * Distinct de `ReferenceController`, qui rend les contextes *en service* pour
 * dessiner la matrice. Ici on rend TOUT, hors-service compris : le registre
 * décide désormais de ce qu'on peut vendre, et une donnée qu'on ne peut pas
 * voir n'est pas pilotable. C'est exactement ce qui a laissé `channel_key`
 * devenir une identité sans que personne ne le remarque.
 *
 * **En lecture seule, et c'est une décision.** Un contexte se pose par
 * migration : l'ouvrir à un formulaire rendrait possible d'en inventer un que
 * ni Shopify ni la facturation ne savent traiter. L'écran montre, il ne crée
 * pas.
 */
@AdminSurface("catalog")
@Controller("catalogue/sales-contexts")
export class SalesContextController {
  constructor(private readonly contexts: SalesContextRegistry) {}

  @Get()
  async list(): Promise<SalesContextAdminView[]> {
    const [contexts, offered] = await Promise.all([
      this.contexts.all(),
      this.contexts.offeredByLocations(),
    ]);
    return contexts.map((context) => ({
      key: context.key,
      label: context.label,
      channelKey: context.channelKey,
      perLocation: context.perLocation,
      position: context.position,
      active: context.active,
      shopifyProjected: context.shopifyProjected,
      handleSuffix: context.handleSuffix,
      root: isRootContext(context.key),
      // Un contexte global n'est offert par aucun lieu, et ce zéro-là n'est pas
      // un manque : il n'a pas de sens à demander. L'écran le sait par
      // `perLocation` et n'affiche pas le compte.
      offeredByLocations: offered.get(context.key) ?? 0,
    }));
  }
}
