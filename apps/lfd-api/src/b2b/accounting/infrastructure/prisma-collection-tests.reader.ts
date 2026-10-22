import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { CollectionTestState } from "../domain/entities/collection-test.js";
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
import { toCollectionTestState } from "./collection-test.mapper.js";

/** La liste « Essais », du plus récent au plus ancien. Le fichier n'en sort pas. */
@Injectable()
export class PrismaCollectionTestsReader extends CollectionTestsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(): Promise<readonly CollectionTestSummary[]> {
    const rows = await this.prisma.collectionTest.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return rows.map((row) => summaryOf(toCollectionTestState(row)));
  }
}

/** L'état sans le fichier : la liste ne fait jamais sortir l'IBAN. */
function summaryOf(state: CollectionTestState): CollectionTestSummary {
  return {
    id: state.id,
    legalEntityId: state.legalEntityId,
    debtorCompanyId: state.debtorCompanyId,
    debtorName: state.debtorName,
    mandateId: state.mandateId,
    mandateReference: state.mandateReference,
    scheme: state.scheme,
    sequence: state.sequence,
    amountCents: state.amountCents,
    requestedCollectionDay: state.requestedCollectionDay,
    remittance: state.remittance,
    messageId: state.messageId,
    endToEndId: state.endToEndId,
    created: state.created,
    bankReturn: state.bankReturn,
    refund: state.refund,
  };
}

/** Le fichier gardé d'un essai — il porte l'IBAN en clair. */
@Injectable()
export class PrismaCollectionTestFileReader extends CollectionTestFileReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async fileOf(id: string): Promise<StoredCollectionTestFile | null> {
    const row = await this.prisma.collectionTest.findUnique({
      where: { id },
      select: { messageId: true, debtorName: true, xml: true, fileSha256: true },
    });
    return row === null
      ? null
      : {
          messageId: row.messageId,
          debtorName: row.debtorName,
          xml: row.xml,
          sha256: row.fileSha256,
        };
  }
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
        messageId: true,
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
          messageId: row.messageId,
          debtorName: row.debtorName,
          amountCents: row.amountCents,
          returned: row.returnKind !== null,
        },
      ]),
    );
  }
}
