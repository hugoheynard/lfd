import { Body, Controller, Post } from "@nestjs/common";
import { z } from "zod";

import { PublicationGesture } from "../../../publication/publication-switch.js";
import { AdminSurface } from "../../../../platform/auth/admin-surface.decorator.js";
import { ZodBody } from "../../../../platform/shared/http/zod-body.pipe.js";
import { B2bCatalogPushService, type B2bPushSummary } from "./push.service.js";

const pushPayload = z.object({
  /**
   * Simuler plutôt qu'envoyer. Par **défaut vrai** : un bouton qui pousse le
   * catalogue vendu ne doit pas partir sur un appel mal formé. L'envoi réel se
   * demande explicitement.
   */
  dryRun: z.boolean().default(true),
});

/**
 * Ressource **push** du canal B2B. Sous-chemin `push` sous le préfixe module
 * `channels/b2b`.
 *
 * Surface staff murée par `@AdminSurface("pim_channels")` : identité vérifiée
 * contre l'annuaire, puis périmètre. Elle a été **ouverte** tant que le
 * référentiel vivait dans son propre processus — un jeton Auth0 valide
 * suffisait, et un révoqué gardait la main sur le catalogue.
 */
@AdminSurface("pim_channels")
@Controller("push")
export class B2bPushController {
  constructor(private readonly pushService: B2bCatalogPushService) {}

  @PublicationGesture()
  @Post()
  push(@Body(new ZodBody(pushPayload)) body: z.infer<typeof pushPayload>): Promise<B2bPushSummary> {
    return this.pushService.push(body.dryRun);
  }
}
