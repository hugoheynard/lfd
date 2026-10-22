import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CollectionTest } from "../domain/entities/collection-test.js";
import { CollectionTestRepository } from "../domain/ports/collection-test.repository.js";
import {
  collectionTestColumns,
  collectionTestFollowUpColumns,
  toCollectionTestState,
} from "./collection-test.mapper.js";

/**
 * Adaptateur d'écriture du prélèvement d'essai. Le fichier s'écrit à la
 * création et jamais ensuite : un `save` d'un essai existant ne réécrit que
 * son retour et son remboursement.
 */
@Injectable()
export class PrismaCollectionTestRepository extends CollectionTestRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(id: string): Promise<CollectionTest | null> {
    const row = await this.prisma.collectionTest.findUnique({ where: { id } });
    return row === null ? null : CollectionTest.rehydrate(toCollectionTestState(row));
  }

  async byEndToEndIds(
    endToEndIds: readonly string[],
  ): Promise<ReadonlyMap<string, CollectionTest>> {
    const rows = await this.prisma.collectionTest.findMany({
      where: { endToEndId: { in: [...endToEndIds] } },
    });
    return new Map(
      rows.map((row) => [row.endToEndId, CollectionTest.rehydrate(toCollectionTestState(row))]),
    );
  }

  async save(test: CollectionTest): Promise<void> {
    const state = test.toPersistence();
    const exists = await this.prisma.collectionTest.findUnique({
      where: { id: state.id },
      select: { id: true },
    });
    if (exists === null) {
      await this.prisma.collectionTest.create({ data: collectionTestColumns(state) });
      return;
    }
    await this.prisma.collectionTest.update({
      where: { id: state.id },
      data: collectionTestFollowUpColumns(state),
    });
  }
}
