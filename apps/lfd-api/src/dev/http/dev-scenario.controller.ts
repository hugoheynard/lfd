import type {
  DevScenarioNextReport,
  DevScenarioResetReport,
  DevScenarioView,
} from "@lfd/contracts";
import { Controller, Get, HttpCode, HttpStatus, Post } from "@nestjs/common";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../platform/auth/staff.decorator.js";
import { DevScenarioService } from "../dev-scenario.service.js";

/**
 * **Le scénario du jour, étape par étape**, depuis la page « Jeu de données »
 * (2026-10-05, `documentation/order/plan-jeu-de-donnees-par-etapes.md` §2).
 *
 * Trois routes et pas de « sauter à » : chaque étape reste un geste court, et
 * l'écran qui enchaîne les `next` sait toujours ce qui est en train de se
 * charger.
 *
 * Même mur que le rechargement (`DevSeedController`) : `b2b_settings`, et la
 * serrure de la base locale dans le service — celle qui rend le geste
 * inexprimable en production.
 */
@Controller("admin/dev/scenario")
@AdminSurface("b2b_settings")
export class DevScenarioController {
  constructor(private readonly scenario: DevScenarioService) {}

  @Get()
  state(): Promise<DevScenarioView> {
    return this.scenario.state();
  }

  @Post("next")
  @HttpCode(HttpStatus.OK)
  next(@StaffUserId() staffUserId: string): Promise<DevScenarioNextReport> {
    return this.scenario.next(staffUserId);
  }

  @Post("reset")
  @HttpCode(HttpStatus.OK)
  reset(@StaffUserId() staffUserId: string): Promise<DevScenarioResetReport> {
    return this.scenario.reset(staffUserId);
  }
}
