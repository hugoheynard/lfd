import { Controller, Get, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import {
  taxActivityQuerySchema,
  type ActivityPageView,
  type TaxActivityQuery,
} from "@lfd/contracts";

import { AdminSurface, RequirePermission } from "../../../platform/auth/admin-surface.decorator.js";
import { ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { ReadTaxActivityJournalQuery } from "../application/queries/read-tax-activity-journal.query.js";

/**
 * La **tranche fiscale** du journal d'activité — ce qui a touché à un taux de
 * TVA (taux, familles et fiches, règles comptables, contextes de vente,
 * surtaxe de retard), par qui, et quand (plan du journal, lot 4).
 *
 * Une route à part, et pas un filtre du journal : le journal exige
 * `activity:read`, réservé à `admin` parce qu'il traverse tous les modules. La
 * comptabilité n'a pas ce droit et ne doit pas l'avoir ; elle relit ici ce
 * qu'elle écrit, bornée au serveur à une liste fermée de types.
 *
 * 🔴 **`pim_tax:write`, exigée explicitement** (décision de Hugo, 2026-09-19 :
 * « qui écrit les taux relit leur histoire »). Déduite du verbe, un `GET`
 * demanderait `pim_tax:read` — que `commercial` et `dev` portent, et qui
 * leur ouvrirait qui a changé quel taux. Au 2026-09-19, `pim_tax:write`
 * appartient à `admin` et `comptabilite` (`ROLE_GRANTS`).
 */
@Controller("admin/activity/tax")
@AdminSurface("pim_tax")
export class AdminTaxActivityController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  @RequirePermission("pim_tax:write")
  read(
    @Query(new ZodQuery(taxActivityQuerySchema)) filters: TaxActivityQuery,
  ): Promise<ActivityPageView> {
    return this.queries.execute<ReadTaxActivityJournalQuery, ActivityPageView>(
      new ReadTaxActivityJournalQuery(filters),
    );
  }
}
