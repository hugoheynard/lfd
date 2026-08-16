import { Controller, Get, UseGuards } from "@nestjs/common";

import { AppConfig } from "../config/app-config.js";
import { Public } from "../auth/public.decorator.js";
import { RecomputeGuard } from "../auth/recompute.guard.js";
import { Auth0ManagementClient, type IdentityDiagnosis } from "./auth0-management.client.js";

/** Le constat, plus les deux connexions visées — c'est le mur, il se vérifie de vue. */
interface IdentityCheckResult extends IdentityDiagnosis {
  readonly domain: string;
  readonly customerConnection: string;
  readonly staffConnection: string;
}

/**
 * **Le contrôle du canal d'identité**, jumeau de celui du courrier.
 *
 * Même constat à l'origine des deux : un canal sortant mal configuré ne tombe
 * pas en panne, il *ressemble* à un canal qui marche jusqu'au jour où quelqu'un
 * s'en sert. Le courrier journalisait sans envoyer ; l'identité rendait un
 * `500` neutre dont la cause vivait dans un journal inatteignable.
 *
 * Il ne crée rien chez le fournisseur : il échange un jeton et lit ce que ce
 * jeton ouvre. Il peut donc tourner à chaque déploiement.
 *
 * Il publie aussi les **deux connexions** visées. Elles ne sont pas secrètes et
 * elles portent le mur entre l'équipe et les clients : les voir côte à côte est
 * le moyen le plus court de constater qu'on ne les a pas interverties.
 */
@Controller("admin/ops/identity-check")
@Public()
@UseGuards(RecomputeGuard)
export class OpsIdentityCheckController {
  constructor(
    private readonly api: Auth0ManagementClient,
    private readonly config: AppConfig,
  ) {}

  @Get()
  async check(): Promise<IdentityCheckResult> {
    return {
      ...(await this.api.diagnose()),
      domain: this.config.auth0Domain(),
      customerConnection: this.config.auth0DatabaseConnection(),
      staffConnection: this.config.auth0StaffConnection(),
    };
  }
}
