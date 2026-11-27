import type { PlannerView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { parisDay } from "../../../basket/application/services/paris-day.js";
import { IsoDate } from "../../../basket/domain/value-objects/iso-date.js";
import { PlannedBasketCheck } from "../../../channels/commerce/planned-basket-check.js";
import { lastPlannableDay } from "../../domain/entities/planned-column.js";
import { PlannedColumnsReader } from "../../domain/ports/planned-columns.reader.js";
import { WishlistReader } from "../../domain/ports/wishlist.reader.js";
import {
  checkView,
  gridItems,
  groupByDay,
  shownDays,
  visibleColumns,
} from "../services/planner-grid.js";
import { PlannerWall } from "../services/planner-wall.js";
import { GetPlannerQuery } from "./get-planner.query.js";

/**
 * **Le planificateur** : les colonnes de la société (le site), groupées par jour, de la date de départ jusqu'à
 * l'horizon, la liste d'envies de la personne, et ce que la passation dirait
 * de chaque article de la grille (§ 4 bis) — une seule question au commerce
 * pour toute la grille.
 */
@QueryHandler(GetPlannerQuery)
export class GetPlannerHandler implements IQueryHandler<GetPlannerQuery, PlannerView> {
  constructor(
    private readonly wall: PlannerWall,
    private readonly days: PlannedColumnsReader,
    private readonly wishlist: WishlistReader,
    private readonly check: PlannedBasketCheck,
    private readonly clock: Clock,
  ) {}

  /**
   * @throws {PlannerProOnlyError} espace personnel.
   * @throws {PlannerMembershipLostError} la personne n'est plus membre de la société.
   * @throws {InvalidOccurrenceDateError} une date de départ qui n'existe pas.
   */
  async execute(query: GetPlannerQuery): Promise<PlannerView> {
    const companyId = await this.wall.companyOf(query.actorUserId, query.companyId);
    const from = IsoDate.fromString(query.from);
    const today = parisDay(this.clock.now());
    const last = lastPlannableDay(today);
    const [stored, wishlist] = await Promise.all([
      this.days.window({ companyId, from, to: last }),
      this.wishlist.itemsOf(query.actorUserId, companyId),
    ]);
    const columns = visibleColumns(stored, today);
    const shown = shownDays({ from, today, last, columns });
    const items = gridItems(shown, columns, wishlist);
    const checks =
      items.length === 0
        ? []
        : await this.check.check({ companyId, buyerUserId: query.actorUserId, items });
    return {
      from: from.value,
      lastPlannableDay: last.value,
      shownDays: shown,
      days: groupByDay(columns),
      wishlist,
      checks: checks.map(checkView),
    };
  }
}
