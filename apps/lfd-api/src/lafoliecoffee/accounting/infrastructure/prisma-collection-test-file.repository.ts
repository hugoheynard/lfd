import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { CollectionTestFile } from "../domain/entities/collection-test-file.js";
import { CollectionTestFileRepository } from "../domain/ports/collection-test-file.repository.js";
import { collectionTestColumns, collectionTestFileColumns } from "./collection-test.mapper.js";

/**
 * Adaptateur d'écriture de l'envoi d'essai : l'envoi, puis ses lignes, dans
 * l'unité de travail de l'appelant — un envoi sans ses lignes n'existe jamais.
 */
@Injectable()
export class PrismaCollectionTestFileRepository extends CollectionTestFileRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async save(file: CollectionTestFile): Promise<void> {
    await this.prisma.collectionTestFile.create({
      data: collectionTestFileColumns(file.toPersistence()),
    });
    await this.prisma.collectionTest.createMany({
      data: file.tests.map((test) => collectionTestColumns(test.toPersistence())),
    });
  }
}
