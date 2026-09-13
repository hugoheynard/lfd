import type { ProductionWorksheetView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { DayOrdersReader } from "../../channels/commerce/day-orders.reader.js";
import { ExpectedProductionReader } from "../../channels/commerce/expected-production.reader.js";
import { ProductionContainerReader } from "../../domain/ports/production-container.reader.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import {
  worksheetOf,
  type DemandedItem,
  type Worksheet,
} from "../../domain/services/production-worksheet.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { ServiceRange } from "../../domain/value-objects/service-range.value-object.js";
import { GetProductionWorksheetQuery } from "./get-production-worksheet.query.js";

/**
 * **La fiche du fournil**, servie en une lecture.
 *
 * Le handler ne tranche rien : il pose quatre sources sur la table et laisse
 * `worksheetOf` arbitrer — « le compte arrêté l'emporte, la demande sinon ».
 * C'est le même partage que le prévisionnel, et c'est ce qui rend la règle
 * éprouvable sans Nest, sans base, et sans doubler quoi que ce soit.
 *
 * ⚠️ **Les quatre lectures partent ENSEMBLE**, exactement comme le prévisionnel
 * juste à côté : aucune ne conditionne les autres. Une journée ouverte n'utilise
 * pas les arrivées, une journée arrêtée n'utilise pas la demande — mais laquelle
 * des deux on jette ne se sait qu'après avoir chargé la journée, et enchaîner
 * les appels pour économiser une requête doublerait la latence d'un écran qu'on
 * rafraîchit debout, en levant les yeux du plan de travail.
 *
 * Il n'écrit rien, pas même un compteur — §4.
 */
@QueryHandler(GetProductionWorksheetQuery)
export class GetProductionWorksheetHandler implements IQueryHandler<
  GetProductionWorksheetQuery,
  ProductionWorksheetView
> {
  constructor(
    private readonly days: ProductionDayRepository,
    private readonly expected: ExpectedProductionReader,
    private readonly orders: DayOrdersReader,
    private readonly containers: ProductionContainerReader,
  ) {}

  async execute(query: GetProductionWorksheetQuery): Promise<ProductionWorksheetView> {
    const day = ServiceDay.of(query.serviceDay);
    const [current, expected, producible, containers] = await Promise.all([
      this.days.load(day),
      this.expected.expectedBetween(ServiceRange.of(day.value, day.value)),
      this.orders.producibleFor(day),
      this.containers.allBySku(),
    ]);

    // 🔴 Le filtre par `orderId` n'est pas un confort. La clôture publie un
    // événement en processus, ni persisté ni rejoué : un abonné en échec laisse
    // des commandes `placed` DÉJÀ inscrites au plan. Sans lui, la fiche
    // annoncerait un écart qui n'existe pas, et le bandeau promettrait
    // d'absorber des pièces déjà comptées.
    const known = new Set(current.orders.map((order) => order.orderId));
    const worksheet = worksheetOf({
      closedAt: current.closedAt,
      retakenAt: current.retaken?.at ?? null,
      counts: current.counts,
      demand: demandOf(expected, day),
      arrivals: producible.filter((order) => !known.has(order.orderId)),
      containers,
    });
    return view(day.value, worksheet);
  }
}

/** Ce que le commerce annonce pour CE jour — rien du tout s'il ne dit rien. */
function demandOf(
  expected: readonly { readonly day: string; readonly items: readonly DemandedItem[] }[],
  day: ServiceDay,
): readonly DemandedItem[] {
  return expected.find((entry) => entry.day === day.value)?.items ?? [];
}

/** Le domaine parle en `Date`, le contrat en ISO. La traduction vit ici. */
function view(date: string, worksheet: Worksheet): ProductionWorksheetView {
  return {
    date,
    generatedAt: worksheet.generatedAt?.toISOString() ?? null,
    retakenAt: worksheet.retakenAt?.toISOString() ?? null,
    lines: worksheet.lines.map((line) => ({
      sku: line.sku,
      productName: line.productName,
      quantity: line.quantity,
      containerLabel: line.containerLabel,
      done: line.done,
      initials: line.initials,
      doneAt: line.doneAt?.toISOString() ?? null,
    })),
    drift: worksheet.drift,
  };
}
