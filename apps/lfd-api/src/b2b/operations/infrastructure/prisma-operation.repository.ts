import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  CorruptedRecordError,
  isUniqueViolation,
} from "../../../platform/database/json-columns.js";
import { Operation } from "../domain/entities/operation.js";
import { OperationKeyTakenError } from "../domain/errors/operation-errors.js";
import { OperationRepository } from "../domain/ports/operation.repository.js";
import { ITEMS_IN_ORDER, itemRows, operationColumns, toRecord } from "./operation-rows.js";

/**
 * Le dépôt d'écriture des opérations du commerce, sur `catalog_operations` —
 * la table du miroir, qui devient la source (O1 ; aucune table neuve).
 *
 * Il ne connaît que l'agrégat : l'état entier part par `add` ou `save`, et la
 * sélection est RÉÉCRITE à chaque fois, dans la transaction du fait de
 * journal. Des lignes de rattachement, pas une histoire : le journal la porte.
 *
 * ⚠️ Il partage la table avec l'ingestion du push (`PrismaCatalogOperationRepository`)
 * jusqu'à la bascule. Les routes qui l'atteignent sont fermées tant que le
 * push écrit les opérations (`OPERATIONS_AT_COMMERCE`).
 */
@Injectable()
export class PrismaOperationRepository extends OperationRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(key: string): Promise<Operation | null> {
    const row = await this.prisma.catalogOperation.findUnique({
      where: { key },
      include: ITEMS_IN_ORDER,
    });
    return row === null ? null : Operation.reconstitute(toRecord(row));
  }

  /**
   * Crée — jamais n'écrase. Deux onglets qui préparent `noel-2026` au même
   * instant passent tous deux la vérification du cas d'usage ; la clé
   * primaire départage, et le second reçoit la phrase qui explique.
   *
   * `received_at` (non nul) prend l'instant de la préparation : une opération
   * née au commerce n'a jamais été reçue, et la colonne garde son sens de
   * « dernière arrivée » pour les autres.
   */
  async add(operation: Operation): Promise<void> {
    const snapshot = operation.snapshot();
    const preparedAt = snapshot.lastWrite?.at;
    if (preparedAt === undefined) {
      throw new CorruptedRecordError("catalog_operations.written_at");
    }
    try {
      await this.prisma.catalogOperation.create({
        data: { key: snapshot.key, ...operationColumns(snapshot), receivedAt: preparedAt },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new OperationKeyTakenError(snapshot.key);
      }
      throw error;
    }
    await this.writeItems(operation);
  }

  /**
   * Écrit l'état entier. Une image CHANGÉE perd le point focal de l'ancienne
   * (centre) : il décrivait une autre image. Le lot 2 le relira à la
   * médiathèque.
   */
  async save(operation: Operation): Promise<void> {
    const snapshot = operation.snapshot();
    const before = await this.prisma.catalogOperation.findUnique({
      where: { key: snapshot.key },
      select: { imageUrl: true },
    });
    const imageChanged = (before?.imageUrl ?? null) !== (snapshot.image?.url ?? null);
    await this.prisma.catalogOperation.update({
      where: { key: snapshot.key },
      data: {
        ...operationColumns(snapshot),
        ...(imageChanged ? { imageFocalX: null, imageFocalY: null } : {}),
      },
    });
    await this.prisma.catalogOperationItem.deleteMany({ where: { operationKey: snapshot.key } });
    await this.writeItems(operation);
  }

  private async writeItems(operation: Operation): Promise<void> {
    const rows = itemRows(operation.snapshot());
    if (rows.length > 0) {
      await this.prisma.catalogOperationItem.createMany({ data: rows });
    }
  }
}
