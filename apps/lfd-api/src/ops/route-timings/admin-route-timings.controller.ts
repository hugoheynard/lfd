import { Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import type { RouteTimingsReport } from "@lfd/ops-contract";

import { AdminSurface, RequirePermission } from "../../platform/auth/admin-surface.decorator.js";
import { Idempotent } from "../../platform/shared/http/idempotent.decorator.js";
import { MeasureRouteTimingsQuery } from "./measure-route-timings.query.js";

/**
 * « Mesurer » sur la Santé : les routes publiques appelées à travers la
 * passerelle avec le secret de diagnostic. **Staff only**, comme toute la
 * surface OPS. Un `POST` parce que chaque appel déclenche des requêtes
 * sortantes — pas une lecture qu'un cache ou un préchargement rejouerait.
 *
 * Le droit est la LECTURE de la Santé : la mesure n'écrit rien, et
 * `ops_health:write` dit « n'ajoute rien » à l'écran des rôles.
 */
@Controller("admin/ops/route-timings")
@AdminSurface("ops_health")
export class AdminRouteTimingsController {
  constructor(private readonly queries: QueryBus) {}

  @Post()
  @RequirePermission("ops_health:read")
  @Idempotent(
    "mesure sans écriture : n'écrit rien en base et ne garde rien ; un rejeu relance des GET publics et rend une nouvelle mesure",
  )
  @HttpCode(HttpStatus.OK)
  measure(): Promise<RouteTimingsReport> {
    return this.queries.execute<MeasureRouteTimingsQuery, RouteTimingsReport>(
      new MeasureRouteTimingsQuery(),
    );
  }
}
