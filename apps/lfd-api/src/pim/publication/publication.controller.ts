import { Controller, Get } from "@nestjs/common";
import type { PimCapabilitiesView } from "@lfd/pim-contracts";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { AppConfig } from "../../platform/config/app-config.js";

/**
 * Ce que le référentiel **peut faire sur ce déploiement**.
 *
 * Une lecture, pas un droit : elle ne dit rien de la personne, tout de
 * l'installation. Les deux se composent — un écran s'affiche si la personne y a
 * droit ET si le déploiement l'offre — et les confondre reviendrait à dire à
 * quelqu'un qu'il lui manque une permission alors qu'il ne lui manque rien.
 *
 * L'écran s'en sert pour ne pas offrir un bouton qui répondrait `409`. Le mur,
 * lui, est le guard — cf. `publication-switch.ts`.
 */
@AdminSurface("pim_channels")
@Controller("capabilities")
export class PimCapabilitiesController {
  constructor(private readonly config: AppConfig) {}

  @Get()
  capabilities(): PimCapabilitiesView {
    return { publication: this.config.publicationEnabled() };
  }
}
