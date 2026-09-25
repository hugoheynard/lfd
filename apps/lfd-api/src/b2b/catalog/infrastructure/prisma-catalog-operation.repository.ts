import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CatalogOperation } from "../domain/entities/catalog-operation.js";
import { CatalogOperationRepository } from "../domain/ports/catalog-operation.repository.js";
import {
  ITEMS_IN_ORDER,
  itemRows,
  operationColumns,
  toOperationState,
} from "./catalog-operation-rows.js";

/**
 * Le miroir des opérations reçues. Il ne connaît que l'agrégat : l'état entier
 * part par `saveMany`, et **rien ne se supprime** — une opération absente d'un
 * envoi est marquée, pas effacée (D9). Seules les lignes de sélection d'une
 * opération TENUE se réécrivent : des rattachements, pas une histoire.
 */
@Injectable()
export class PrismaCatalogOperationRepository extends CatalogOperationRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(key: string): Promise<CatalogOperation | null> {
    const row = await this.prisma.catalogOperation.findUnique({
      where: { key },
      include: ITEMS_IN_ORDER,
    });
    return row === null ? null : CatalogOperation.reconstitute(toOperationState(row));
  }

  async loadAllIncludingWithdrawn(): Promise<CatalogOperation[]> {
    const rows = await this.prisma.catalogOperation.findMany({ include: ITEMS_IN_ORDER });
    return rows.map((row) => CatalogOperation.reconstitute(toOperationState(row)));
  }

  /**
   * Dans une transaction : un miroir à moitié écrit annoncerait Noël avec la
   * sélection de Pâques. Une opération retirée garde sa sélection telle que
   * reçue — c'est ce que l'écran de réception montre d'elle.
   */
  async saveMany(operations: readonly CatalogOperation[]): Promise<void> {
    if (operations.length === 0) {
      return;
    }
    await this.prisma.$transaction(async (tx) => {
      for (const operation of operations) {
        const state = operation.toPersistence();
        const columns = operationColumns(state);
        await tx.catalogOperation.upsert({
          where: { key: state.facts.key },
          create: { key: state.facts.key, ...columns },
          update: columns,
        });
        if (state.withdrawnAt !== null) {
          continue;
        }
        await tx.catalogOperationItem.deleteMany({ where: { operationKey: state.facts.key } });
        const rows = itemRows(state.facts);
        if (rows.length > 0) {
          await tx.catalogOperationItem.createMany({ data: rows });
        }
      }
    });
  }
}
