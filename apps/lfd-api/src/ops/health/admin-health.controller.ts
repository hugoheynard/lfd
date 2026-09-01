import { Controller, Get } from "@nestjs/common";
import type { EcosystemHealth } from "@lfd/ops-contract";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { OpsHealthService } from "./ops-health.service.js";

/**
 * La carte de l'écosystème — ce que l'écran rendra. **Staff only**, en lecture
 * seule, comme toute la surface OPS.
 *
 * Elle rend TOUS les nœuds déclarés, y compris ceux dont on ne sait rien : un
 * nœud absent de la réponse serait indistinguable d'un nœud qui va bien.
 */
@Controller("admin/ops/health")
@AdminSurface("ops_health")
export class AdminHealthController {
  constructor(private readonly health: OpsHealthService) {}

  @Get()
  read(): Promise<EcosystemHealth> {
    return this.health.read();
  }
}
