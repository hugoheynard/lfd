import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  CollectionTestFileReader,
  type StoredCollectionTestFile,
} from "../domain/ports/collection-test-file.reader.js";
import {
  CollectionTestReturnTargetsReader,
  type CollectionTestReturnTarget,
} from "../domain/ports/collection-test-return-targets.reader.js";
import {
  CollectionTestsReader,
  type CollectionTestSummary,
} from "../domain/ports/collection-tests.reader.js";
import { MandateCollectionTestsReader } from "../domain/ports/mandate-collection-tests.reader.js";
import type { PriorCollectionTest } from "../domain/services/collection-test-lookalike.js";
import { WITH_FILE_MESSAGE_ID, toCollectionTestState } from "./collection-test.mapper.js";

/**
 * La liste « Essais », du plus récent au plus ancien, chaque ligne avec le
 * `MsgId` de son envoi. Le fichier n'en sort pas.
 */
@Injectable()
export class PrismaCollectionTestsReader extends CollectionTestsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(): Promise<readonly CollectionTestSummary[]> {
    const rows = await this.prisma.collectionTest.findMany({
      include: WITH_FILE_MESSAGE_ID,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return rows.map(toCollectionTestState);
  }
}

const STORED_FILE = { messageId: true, xml: true, fileSha256: true } as const;

/** Le fichier gardé d'un envoi d'essai — il porte l'IBAN en clair. */
@Injectable()
export class PrismaCollectionTestFileReader extends CollectionTestFileReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async fileOf(fileId: string): Promise<StoredCollectionTestFile | null> {
    const row = await this.prisma.collectionTestFile.findUnique({
      where: { id: fileId },
      select: STORED_FILE,
    });
    return row === null ? null : storedFileOf(row);
  }

  async fileOfTest(testId: string): Promise<StoredCollectionTestFile | null> {
    const row = await this.prisma.collectionTest.findUnique({
      where: { id: testId },
      select: { file: { select: STORED_FILE } },
    });
    return row === null ? null : storedFileOf(row.file);
  }
}

function storedFileOf(row: {
  readonly messageId: string;
  readonly xml: string;
  readonly fileSha256: string;
}): StoredCollectionTestFile {
  return { messageId: row.messageId, xml: row.xml, sha256: row.fileSha256 };
}

/** Les essais qu'un fichier de retours désigne. */
@Injectable()
export class PrismaCollectionTestReturnTargetsReader extends CollectionTestReturnTargetsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async byEndToEndIds(
    endToEndIds: readonly string[],
  ): Promise<ReadonlyMap<string, CollectionTestReturnTarget>> {
    if (endToEndIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.collectionTest.findMany({
      where: { endToEndId: { in: [...endToEndIds] } },
      select: {
        id: true,
        endToEndId: true,
        file: { select: { messageId: true } },
        debtorName: true,
        amountCents: true,
        returnKind: true,
      },
    });
    return new Map(
      rows.map((row) => [
        row.endToEndId,
        {
          testId: row.id,
          messageId: row.file.messageId,
          debtorName: row.debtorName,
          amountCents: row.amountCents,
          returned: row.returnKind !== null,
        },
      ]),
    );
  }
}

/** Les essais d'un mandat depuis un instant — la garde anti-doublon les compare. */
@Injectable()
export class PrismaMandateCollectionTestsReader extends MandateCollectionTestsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async generatedSince(mandateId: string, since: Date): Promise<readonly PriorCollectionTest[]> {
    const rows = await this.prisma.collectionTest.findMany({
      where: { mandateId, createdAt: { gte: since } },
      select: { endToEndId: true, amountCents: true, createdAt: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return rows;
  }
}
