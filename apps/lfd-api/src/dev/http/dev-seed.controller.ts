import type { DevSeedOrdersOnlyReport, DevSeedReport } from "@lfd/contracts";
import { Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { DevSeedService } from "../dev-seed.service.js";

/**
 * **Recharger le jeu de données de développement**, depuis le back-office.
 *
 * Deux gestes : tout remettre dans l'état que le seed déclare (`reload`), ou
 * ne rejouer que le scénario de commandes (`reload/orders`, 2026-09-30). Le
 * second est admis parce qu'il est déjà un tout décrit : c'est exactement
 * `pnpm seed:orders`, qui repose lui-même ses clients. « Juste la station »
 * n'existe toujours pas — elle ne se rejoue pas sans ses commandes.
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

  @Post("reload/orders")
  @HttpCode(HttpStatus.OK)
  reloadOrders(): Promise<DevSeedOrdersOnlyReport> {
    return this.seeding.reloadOrders();
  }
}
