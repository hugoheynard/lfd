import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { BASKET_INCLUDE, basketFromRow } from "../../basket/infrastructure/basket-row.mapper.js";
import type { IsoDate } from "../../basket/domain/value-objects/iso-date.js";
import { DUE_STATES, type Occurrence } from "../domain/entities/occurrence.js";
import { type DueOccurrence, OccurrenceRepository } from "../domain/ports/occurrence.repository.js";
import { occurrenceColumns, occurrenceFromRow } from "./occurrence-row.mapper.js";

const OPEN_STATES = ["planned", "skipped", "refused"];

/**
 * Adaptateur Prisma des échéances. `save` écrit sous condition d'état
 * (`updateMany` sur l'id ET l'état relu) : l'issue d'un balayage et le geste
 * d'un client ne s'écrasent pas.
 */
@Injectable()
export class PrismaOccurrenceRepository extends OccurrenceRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async insertMany(occurrences: readonly Occurrence[]): Promise<void> {
    await this.prisma.occurrence.createMany({
      data: occurrences.map(({ snapshot }) => ({
        id: snapshot.id,
        basketId: snapshot.basketId,
        serviceDay: snapshot.serviceDay.toUtcDate(),
        placeOn: snapshot.placeOn.toUtcDate(),
        ...occurrenceColumns(snapshot),
        createdAt: snapshot.createdAt,
      })),
    });
  }

  async serviceDaysFrom(basketId: string, from: IsoDate): Promise<ReadonlySet<string>> {
    const rows = await this.prisma.occurrence.findMany({
      where: { basketId, serviceDay: { gte: from.toUtcDate() } },
      select: { serviceDay: true },
    });
    return new Set(rows.map((row) => row.serviceDay.toISOString().slice(0, 10)));
  }

  async load(basketId: string, serviceDay: IsoDate): Promise<Occurrence | null> {
    const row = await this.prisma.occurrence.findUnique({
      where: { basketId_serviceDay: { basketId, serviceDay: serviceDay.toUtcDate() } },
    });
    return row === null ? null : occurrenceFromRow(row);
  }

  async openOf(basketId: string): Promise<readonly Occurrence[]> {
    const rows = await this.prisma.occurrence.findMany({
      where: { basketId, state: { in: OPEN_STATES } },
      orderBy: { serviceDay: "asc" },
    });
    return rows.map(occurrenceFromRow);
  }

  async due(today: IsoDate, limit: number): Promise<readonly DueOccurrence[]> {
    const rows = await this.prisma.occurrence.findMany({
      // La forme de `occurrence_due_idx` : `place_on`, sous `state IN (planned, refused)`.
      where: {
        placeOn: { lte: today.toUtcDate() },
        state: { in: [...DUE_STATES] },
        basket: { status: "active" },
      },
      orderBy: [{ placeOn: "asc" }, { serviceDay: "asc" }],
      take: limit,
      include: { basket: { include: BASKET_INCLUDE } },
    });
    return rows.map((row) => ({
      occurrence: occurrenceFromRow(row),
      basket: basketFromRow(row.basket),
    }));
  }

  async save(occurrence: Occurrence): Promise<boolean> {
    const { snapshot, loadedState } = occurrence;
    const written = await this.prisma.occurrence.updateMany({
      where: { id: snapshot.id, ...(loadedState === null ? {} : { state: loadedState }) },
      data: occurrenceColumns(snapshot),
    });
    return written.count === 1;
  }
}
