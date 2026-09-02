import { Controller, Get } from "@nestjs/common";
import { UseGuards } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import type { CatalogHealthView } from "@lfd/contracts";

import { Public } from "../../../platform/auth/public.decorator.js";
import { RecomputeGuard } from "../../../platform/auth/recompute.guard.js";
import { CheckCatalogHealthQuery } from "../application/queries/check-catalog-health.query.js";

/**
 * **La porte machine du contrôle de santé** — même lecture, autre serrure.
 *
 * 🔴 Elle existe parce que `ops_catalog_parity.yml` ne pouvait pas
 * s'authentifier, et personne ne l'avait vu. Il envoie `x-lfc-recompute-token` à
 * `/admin/catalog/parity`, qui est gardée par `@AdminSurface("b2b_catalog")` —
 * une surface Auth0 qui attend un jeton porteur de staff. Le `RecomputeGuard`
 * n'y est **pas** posé : la requête rendait `401`.
 *
 * C'est exactement le mode de défaillance que l'en-tête de ce workflow décrit
 * pour son propre passé : `workflow_dispatch`, donc il n'échoue que le jour où
 * quelqu'un le lance. Il avait été réparé le 2026-09-02 sur la FORME de son
 * rapport ; sa serrure, elle, n'avait jamais été vérifiée.
 *
 * Le chemin `admin/ops/…-check` avec `@Public()` + `RecomputeGuard` est celui de
 * la maison (`admin/ops/mail-check`, `admin/ops/identity-check`) : un secret
 * partagé pour une machine, une identité vérifiée pour une personne. Les deux
 * portes servent la **même** requête — le fait mesuré ne dépend pas de qui
 * demande.
 */
@Controller("admin/ops/catalog-health")
@Public()
@UseGuards(RecomputeGuard)
export class OpsCatalogHealthController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  health(): Promise<CatalogHealthView> {
    return this.queries.execute<CheckCatalogHealthQuery, CatalogHealthView>(
      new CheckCatalogHealthQuery(),
    );
  }
}
