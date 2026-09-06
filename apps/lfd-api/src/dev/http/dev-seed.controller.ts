import type { DevSeedReport } from "@lfd/contracts";
import { Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { DevSeedService } from "../dev-seed.service.js";

/**
 * **Recharger le jeu de données de développement**, depuis le back-office.
 *
 * Une seule route, et un seul geste : tout remettre dans l'état que le seed
 * déclare. Pas de bouton « juste les commandes » ni « juste la station » — les
 * trois étapes dépendent l'une de l'autre, et offrir de n'en jouer qu'une
 * produirait des états intermédiaires que personne n'a décrits.
 *
 * Murée par `b2b_settings`, comme les points de retrait et les heures limites :
 * c'est le même périmètre — le paramétrage de la plateforme. Le service, lui,
 * refuse en plus toute base qui n'est pas locale (cf. `DevSeedService`), et
 * c'est cette serrure-là qui compte : elle rend le geste **inexprimable** en
 * production plutôt que simplement interdit.
 */
@Controller("admin/dev/seed")
@AdminSurface("b2b_settings")
export class DevSeedController {
  constructor(private readonly seeding: DevSeedService) {}

  @Post("reload")
  @HttpCode(HttpStatus.OK)
  reload(): Promise<DevSeedReport> {
    return this.seeding.reload();
  }
}
