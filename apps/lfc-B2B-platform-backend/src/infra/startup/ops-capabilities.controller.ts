import { Controller, Get, UseGuards } from "@nestjs/common";

import { AppConfig } from "../config/app-config.js";
import { Public } from "../auth/public.decorator.js";
import { RecomputeGuard } from "../auth/recompute.guard.js";
import { StartupReport } from "./startup-report.service.js";
import type { MissingCapability } from "./capability-audit.js";

/** Ce que l'exploitant apprend : quelle image répond, et ce qu'elle ne sait pas faire. */
interface CapabilitiesReport {
  readonly revision: string;
  readonly missing: readonly MissingCapability[];
}

/**
 * **L'inventaire des canaux, à la demande.**
 *
 * Le bulletin de démarrage disait déjà tout ceci — une fois, au boot, dans un
 * journal qui n'était capté par personne (cf. `wrangler.jsonc`, bloc
 * `observability`). Deux corrections valent mieux qu'une : rendre le journal
 * audible, et rendre le constat **interrogeable**. La seconde est celle qui
 * répond à 7 h du matin, sans avoir à redémarrer le container pour reproduire
 * ce qu'il a dit au démarrage.
 *
 * **Derrière le jeton d'exploitation**, comme le contrôle du courrier. La liste
 * nomme les variables absentes : dire publiquement quelles portes ne sont pas
 * verrouillées est une aide qu'on ne doit qu'à soi-même. La sonde publique
 * `/health`, elle, ne porte que des **compteurs** — assez pour qu'un
 * déploiement ou une supervision s'arrête, rien qui oriente un tiers.
 *
 * Aucune **valeur** ne sort d'ici : l'inventaire ne manipule que des booléens
 * (cf. `StartupReport.snapshot`), donc même une fuite de cette réponse ne
 * révèle pas un secret.
 */
@Controller("admin/ops/capabilities")
@Public()
@UseGuards(RecomputeGuard)
export class OpsCapabilitiesController {
  constructor(
    private readonly report: StartupReport,
    private readonly config: AppConfig,
  ) {}

  @Get()
  capabilities(): CapabilitiesReport {
    return { revision: this.config.revision(), missing: this.report.missing() };
  }
}
