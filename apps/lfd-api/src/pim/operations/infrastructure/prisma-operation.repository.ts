import { Injectable } from "@nestjs/common";

import type { WriteTicket } from "../../../platform/journal/scoped-journal.js";
import { isUniqueViolation } from "../../catalogue/shared/infrastructure/json-readers.js";
import { PimPrismaService } from "../../infra/database/pim-prisma.service.js";
import { Operation } from "../domain/entities/operation.js";
import { OperationKeyTakenError } from "../domain/errors/operation-errors.js";
import { OperationRepository } from "../domain/ports/operation.repository.js";
import { ITEMS_IN_ORDER, itemRows, operationColumns, toRecord } from "./operation-rows.js";

/**
 * Le dépôt d'écriture des opérations, sur le schéma `pim`.
 *
 * Il ne connaît que l'agrégat : l'état entier part par `add` ou `save`, et la
 * sélection est RÉÉCRITE à chaque fois — supprimée puis recréée dans la même
 * transaction que le fait du journal. Des lignes de rattachement, pas un
 * agrégat : les réécrire n'efface aucune histoire, le journal la porte.
 */
@Injectable()
export class PrismaOperationRepository extends OperationRepository {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async load(key: string): Promise<Operation | null> {
    const row = await this.prisma.operation.findUnique({ where: { key }, include: ITEMS_IN_ORDER });
    return row === null ? null : Operation.reconstitute(toRecord(row));
  }

  /**
   * Crée — jamais n'écrase. Deux onglets qui préparent `noel-2026` au même
   * instant passent tous deux la vérification du cas d'usage ; la clé
   * primaire départage, et le second reçoit la phrase qui explique plutôt
   * qu'une erreur Prisma brute.
   */
  async add(operation: Operation, _ticket: WriteTicket): Promise<void> {
    const snapshot = operation.snapshot();
    try {
      await this.prisma.operation.create({
        data: { key: snapshot.key, ...operationColumns(snapshot) },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new OperationKeyTakenError(snapshot.key);
      }
      throw error;
    }
    await this.writeItems(operation);
  }

  async save(operation: Operation, _ticket: WriteTicket): Promise<void> {
    const snapshot = operation.snapshot();
    await this.prisma.operation.update({
      where: { key: snapshot.key },
      data: operationColumns(snapshot),
    });
    await this.prisma.operationItem.deleteMany({ where: { operationKey: snapshot.key } });
    await this.writeItems(operation);
  }

  private async writeItems(operation: Operation): Promise<void> {
    const rows = itemRows(operation.snapshot());
    if (rows.length > 0) {
      await this.prisma.operationItem.createMany({ data: rows });
    }
  }
}
