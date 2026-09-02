import { Body, Controller, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { z } from "zod";

import { PublicationGesture } from "../../../publication/publication-switch.js";
import { AdminSurface } from "../../../../platform/auth/admin-surface.decorator.js";
import { ZodBody } from "../../../../platform/shared/http/zod-body.pipe.js";
import { PushB2bCatalogCommand } from "../application/push-b2b-catalog.js";
import type { B2bPushSummary } from "./push.service.js";

const pushPayload = z.object({
  /**
   * Simuler plutôt qu'envoyer. Par **défaut vrai** : un bouton qui pousse le
   * catalogue vendu ne doit pas partir sur un appel mal formé. L'envoi réel se
   * demande explicitement.
   */
  dryRun: z.boolean().default(true),
  /**
   * L'empreinte rendue par la simulation qu'on vient de relire.
   *
   * Fournie, elle est **exigée** : si le catalogue a bougé depuis, rien ne part
   * et la route rend `409`. C'est ce qui relie la relecture à l'envoi — sans
   * elle, l'aperçu qu'on regarde et le push qui suit sont deux appels séparés
   * que rien ne rattache.
   *
   * ⚠️ **Optionnelle**, et c'est une étape, pas un état final : le front en
   * ligne appelle déjà cette route sans elle, et un contrat servi ne se casse
   * pas dans le même déploiement. Elle passe obligatoire au troisième temps.
   */
  fingerprint: z.string().min(1).optional(),
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
  constructor(private readonly commands: CommandBus) {}

  @PublicationGesture()
  @Post()
  push(@Body(new ZodBody(pushPayload)) body: z.infer<typeof pushPayload>): Promise<B2bPushSummary> {
    return this.commands.execute<PushB2bCatalogCommand, B2bPushSummary>(
      new PushB2bCatalogCommand(body.dryRun, body.fingerprint),
    );
  }
}
