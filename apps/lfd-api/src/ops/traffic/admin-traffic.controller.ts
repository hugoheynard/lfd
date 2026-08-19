import { Controller, Get, Query } from "@nestjs/common";
import type { TrafficReport } from "@lfd/ops-contract";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { resolveWindowMinutes } from "./traffic-query.js";
import { TrafficReader } from "./traffic-reader.port.js";

/**
 * La surface de lecture d'OPS : ce que la gateway a vu passer.
 *
 * **Staff only**, comme toute la carte : elle expose la topologie interne et des
 * messages techniques, et rien de tout ça n'a à sortir côté client.
 *
 * **Lecture seule**, et ce n'est pas provisoire par paresse : OPS observe, il
 * n'agit pas (design §2). Le jour où des actions arriveront, elles seront
 * murées à part — pas glissées ici parce que le contrôleur existait déjà.
 */
@Controller("admin/ops/traffic")
@AdminSurface("ops")
export class AdminTrafficController {
  constructor(private readonly traffic: TrafficReader) {}

  @Get()
  read(@Query("minutes") minutes?: string): Promise<TrafficReport> {
    return this.traffic.read(resolveWindowMinutes(minutes));
  }
}
