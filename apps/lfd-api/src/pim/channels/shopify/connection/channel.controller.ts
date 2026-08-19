import { Body, Controller, Get, Post, Put } from "@nestjs/common";
import { z } from "zod";

import { AdminSurface } from "../../../../infra/auth/admin-surface.decorator.js";
import { ZodBody } from "../../../../shared/http/zod-body.pipe.js";
import { ShopifyConnectionService } from "./connection.service.js";
import { ShopifySettingsService } from "../shared/settings.service.js";

const settingsPayload = z.object({
  shopDomain: z.string(),
  apiVersion: z.string().min(1),
  isEnabled: z.boolean(),
});

/**
 * **Connexion au canal** : les réglages (domaine, version, activation) et la
 * vérification. C'est le niveau « canal » — générique, ce que toute intégration
 * a en commun ; le jeton reste un secret d'environnement, jamais ici.
 *
 * Préfixe monté par le module (`channels/shopify`) via `RouterModule` : ce
 * contrôleur ne déclare que son sous-chemin `settings`.
 *
 * Surface staff murée par `@AdminSurface("catalog")` : identité vérifiée
 * contre l'annuaire, puis périmètre. Elle a été **ouverte** tant que le
 * référentiel vivait dans son propre processus — un jeton Auth0 valide
 * suffisait, et un révoqué gardait la main sur le catalogue.
 */
@AdminSurface("catalog")
@Controller("settings")
export class ChannelController {
  constructor(
    private readonly settings: ShopifySettingsService,
    private readonly connection: ShopifyConnectionService,
  ) {}

  @Get()
  read() {
    return this.settings.read();
  }

  @Put()
  save(@Body(new ZodBody(settingsPayload)) body: z.infer<typeof settingsPayload>) {
    return this.settings.save(body);
  }

  /** Test de connexion — bouton « Vérifier » de l'écran d'intégration. */
  @Post("verify")
  verify() {
    return this.connection.verify();
  }
}
