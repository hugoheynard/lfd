import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CollectionReturn } from "../domain/entities/collection-return.js";
import { CollectionReturnRepository } from "../domain/ports/collection-return.repository.js";
import { collectionReturnColumns, toCollectionReturnState } from "./collection-return.mapper.js";

/**
 * Adaptateur d'écriture des retours bancaires. Un `upsert` : la saisie crée,
 * la résolution réécrit son état. L'index unique sur `end_to_end_id` refuse
 * en base un second retour qu'une course aurait laissé passer.
 */
@Injectable()
export class PrismaCollectionReturnRepository extends CollectionReturnRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(returnId: string): Promise<CollectionReturn | null> {
    const row = await this.prisma.collectionReturn.findUnique({ where: { id: returnId } });
    return row === null ? null : CollectionReturn.rehydrate(toCollectionReturnState(row));
  }

  async ofEndToEnd(endToEndId: string): Promise<CollectionReturn | null> {
    const row = await this.prisma.collectionReturn.findUnique({ where: { endToEndId } });
    return row === null ? null : CollectionReturn.rehydrate(toCollectionReturnState(row));
  }

  async save(bankReturn: CollectionReturn): Promise<void> {
    const state = bankReturn.toPersistence();
    const columns = collectionReturnColumns(state);
    await this.prisma.collectionReturn.upsert({
      where: { id: state.id },
      create: { id: state.id, ...columns },
      update: columns,
    });
  }
}
