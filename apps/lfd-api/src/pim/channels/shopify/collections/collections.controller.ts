import { Body, Controller, Post } from "@nestjs/common";
import { z } from "zod";

import { Public } from "../../../../infra/auth/public.decorator.js";
import { ZodBody } from "../../../../shared/http/zod-body.pipe.js";
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
 * ⚠️ `@Public()` temporaire — même dérogation que le catalogue (Auth0 non câblé).
 */
@Public()
@Controller("collections/tva")
export class ShopifyCollectionsController {
  constructor(private readonly collections: ShopifyCollectionsService) {}

  /** Rapproche les collections de TVA voulues et la boutique, sans rien écrire. */
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
