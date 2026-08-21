import { Body, Controller, Post } from "@nestjs/common";
import { z } from "zod";

import {
  AdminSurface,
  RequirePermission,
} from "../../../../platform/auth/admin-surface.decorator.js";
import { ZodBody } from "../../../../platform/shared/http/zod-body.pipe.js";
import { ShopifyCollectionsService } from "./collections.service.js";

/** Les collections de TVA voulues, telles que le front les connaît (handle + titre). */
const desiredCollectionsPayload = z.object({
  desired: z.array(
    z.object({
      handle: z.string().min(1),
      title: z.string().min(1),
    }),
  ),
});

/**
 * Ressource **collections de TVA** : inspection (diff) et push (créer les
 * manquantes). Le front envoie l'ensemble voulu ; le backend reste
 * TVA-agnostique. Sous-chemin `collections/tva` sous le préfixe module
 * `channels/shopify`.
 *
 * Surface staff murée par `@AdminSurface("catalog")` : identité vérifiée
 * contre l'annuaire, puis périmètre. Elle a été **ouverte** tant que le
 * référentiel vivait dans son propre processus — un jeton Auth0 valide
 * suffisait, et un révoqué gardait la main sur le catalogue.
 *
 * `catalog` et non `tax`, bien que le contenu soit fiscal : ce contrôleur
 * **écrit chez un tiers**. Poser le taux est comptable, le publier est un geste
 * de catalogue — la comptabilité pose un taux juste, le publieur réconcilie.
 */
@AdminSurface("catalog")
@Controller("collections/tva")
export class ShopifyCollectionsController {
  constructor(private readonly collections: ShopifyCollectionsService) {}

  /**
   * Rapproche les collections de TVA voulues et la boutique, sans rien écrire.
   *
   * `catalog:read` explicite : le verbe ment. `POST` impliquerait `write`, donc
   * l'inspection était réservée à l'admin — un lecteur du catalogue voyait un
   * bouton « Inspecter » qui lui répondait 403.
   */
  @RequirePermission("catalog:read")
  @Post("inspect")
  inspect(
    @Body(new ZodBody(desiredCollectionsPayload))
    body: z.infer<typeof desiredCollectionsPayload>,
  ) {
    return this.collections.inspect(body.desired);
  }

  /** Crée les collections manquantes (vides), puis renvoie l'état réconcilié. */
  @Post("push")
  push(
    @Body(new ZodBody(desiredCollectionsPayload))
    body: z.infer<typeof desiredCollectionsPayload>,
  ) {
    return this.collections.push(body.desired);
  }
}
