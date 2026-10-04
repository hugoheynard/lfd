import type { ProductionPackingView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import { PackedDayReading } from "../services/packed-day-reading.service.js";
import { QualityCheckReader } from "../../domain/ports/quality-check.reader.js";
import { withContainerList } from "../../domain/services/packing-container-list.js";
import { packingBoardOf } from "../../domain/services/production-packing.js";
import { heldOrderIds } from "../../domain/services/quality-verdicts.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { GetProductionPackingQuery } from "./get-production-packing.query.js";

/**
 * **Le poste du fournil**, servi en une lecture.
 *
 * Une seule source, contrairement à la fiche d'atelier : il n'y a rien à
 * arbitrer ici. Le colisage ne se fait que sur un plan ARRÊTÉ — un bac se
 * remplit à partir d'un bon figé, pas d'une demande qui bouge encore — donc la
 * journée seule dit tout, et le calcul de la balance vit dans `packingBoardOf`.
 *
 * ⚠️ Une journée ouverte rend `closedAt: null` avec deux listes vides, **et ne
 * lève pas**. Une lecture n'a pas à refuser un jour qui existe et qu'on a
 * simplement ouvert trop tôt ; c'est l'écran qui dit « plan non arrêté ».
 *
 * ⚠️ Le `Clock` n'entre ici que pour `relativeDay` — « aujourd'hui », « demain »
 * — selon l'horloge du SERVEUR. Celle d'un poste de fournil n'est pas une
 * autorité, et l'écran ne compare plus de dates.
 *
 * La **retenue au contrôle** (lot PC2, 2026-10-02) se lit ici, dans le même
 * bloc : les contrôles de la journée, et `heldOrderIds` — la règle que le
 * retrait lit au comptoir. Le plan est celui de la journée chargée.
 *
 * ## Journée `packing` (K2)
 *
 * Le bac, ses lignes, ses containers et le disponible se lisent au COLISAGE
 * (`PackedDayReading`), posés sur le plan du fournil :
 * même calcul, même contrat. Le choix suit `packing_owner`, jamais une table
 * de l'ombre (§13 B1).
 *
 * Il n'écrit rien, pas même un compteur — §4.
 */
@QueryHandler(GetProductionPackingQuery)
export class GetProductionPackingHandler implements IQueryHandler<
  GetProductionPackingQuery,
  ProductionPackingView
> {
  constructor(
    private readonly days: PackedDayReading,
    private readonly clock: Clock,
    private readonly staffAuthors: StaffAuthorDirectory,
    private readonly checks: QualityCheckReader,
  ) {}

  async execute(query: GetProductionPackingQuery): Promise<ProductionPackingView> {
    const day = ServiceDay.of(query.serviceDay);
    const { day: current, available, station } = await this.days.load(day);
    const orders = current.orders;
    const authors = await this.staffAuthors.identify(
      orders.map((order) => order.packed?.by ?? null),
    );
    const plan = orders.flatMap((order) =>
      order.lines.map((line) => ({ orderId: order.orderId, sku: line.sku })),
    );
    const heldOrders = heldOrderIds(day, await this.checks.forDay(day), plan);
    const board = packingBoardOf({
      date: day.value,
      closedAt: current.closedAt,
      orders,
      counts: current.counts,
      available,
      now: this.clock.now(),
      authorName: (reference) => authors.nameOf(reference),
      heldOrders,
    });
    // K2b : la colonne Contenants, par champs ajoutés.
    return { ...board, sheets: withContainerList(board.sheets, station) };
  }
}
