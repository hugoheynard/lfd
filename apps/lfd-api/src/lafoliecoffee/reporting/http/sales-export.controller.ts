import { Controller, Get, Header, Query, UseGuards } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { Throttle } from "@nestjs/throttler";

import { Public } from "../../../platform/auth/public.decorator.js";
import { ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { GetSalesExportQuery } from "../application/queries/get-sales-export.query.js";
import type { SalesExportView } from "../application/queries/sales-export.view.js";
import { ExportReaderKeyGuard } from "./export-reader-key.guard.js";
import { type SalesExportQueryParams, salesExportQuerySchema } from "./sales-export-query.js";

/** Le serveur de la Direction appelle une fois par nuit : dix par minute suffisent. */
const EXPORTS_PER_MINUTE = 10;
const MINUTE_MS = 60_000;

/**
 * **L'export des ventes**, lu par le serveur de la Direction (plan
 * `documentation/commandes/export/plan-export-des-ventes.md`, § 3, § 6) :
 * `GET /exports/sales?from=AAAA-MM-JJ&to=AAAA-MM-JJ`, servi sous `/api/lfd`.
 *
 * `@Public()` pour la garde Auth0 globale — un jeton staff ou client n'ouvre
 * rien ici — et gardée par la clé `X-Export-Key` ({@link ExportReaderKeyGuard}),
 * qui n'ouvre rien d'autre (`lint:export-key-guard`). Le seau par IP de l'API
 * est resserré ; la passerelle en tient un autre, avant de transmettre.
 *
 * `Cache-Control: private, no-store` est posé ici : le middleware commun ne
 * reconnaît une personne qu'à son `Authorization`, et servirait cette réponse
 * en `private, no-cache` — gardée sur le disque de l'appelant. Les ventes ne
 * s'y gardent que par le geste de la Direction.
 */
@Controller("exports")
@Public()
@UseGuards(ExportReaderKeyGuard)
export class SalesExportController {
  constructor(private readonly queries: QueryBus) {}

  @Get("sales")
  @Throttle({ default: { limit: EXPORTS_PER_MINUTE, ttl: MINUTE_MS } })
  @Header("Cache-Control", "private, no-store")
  sales(
    @Query(new ZodQuery(salesExportQuerySchema)) params: SalesExportQueryParams,
  ): Promise<SalesExportView> {
    return this.queries.execute<GetSalesExportQuery, SalesExportView>(
      new GetSalesExportQuery(params.from, params.to),
    );
  }
}
