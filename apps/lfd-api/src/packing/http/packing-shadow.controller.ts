import { Controller, Get, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { z } from "zod";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { ZodQuery } from "../../platform/shared/http/zod-body.pipe.js";
import { ComparePackingShadowQuery } from "../application/queries/compare-packing-shadow.query.js";
import type { PackingShadowComparison } from "../application/queries/compare-packing-shadow.query.js";

/** La forme seulement : un jour `AAAA-MM-JJ`. Le reste est au domaine. */
const ShadowQuerySchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u) });
type ShadowQuery = z.infer<typeof ShadowQuerySchema>;

/**
 * **Le contrôle de l'ombre** — une route de lecture, sans écran (plan
 * `colisage/plan-domaine-colisage.md`, K1). Elle dit, pour une journée, si le
 * colisage calculé à côté donne le même colisable que le poste réel.
 *
 * Sous `production_packing` : c'est le droit de qui tient le poste qu'on
 * répète, et une lecture n'en exige que la lecture. Aucun droit neuf, aucun
 * rôle touché.
 *
 * Il n'injecte que le bus — `lint:controller-buses`.
 */
@Controller("admin/packing")
@AdminSurface("production_packing")
export class PackingShadowController {
  constructor(private readonly queries: QueryBus) {}

  @Get("shadow")
  async shadow(
    @Query(new ZodQuery(ShadowQuerySchema)) query: ShadowQuery,
  ): Promise<PackingShadowComparison> {
    return this.queries.execute<ComparePackingShadowQuery, PackingShadowComparison>(
      new ComparePackingShadowQuery(query.date),
    );
  }
}
