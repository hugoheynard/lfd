import { Injectable } from "@nestjs/common";

import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";
import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { PublicationSequence } from "./publication-sequence.js";

/**
 * L'adaptateur, en SQL écrit à la main : Prisma n'exprime ni le verrou de
 * ligne ni la séquence. Les deux suivent la transaction ambiante (le client
 * est routé vers elle), et c'est ce qui donne au verrou sa durée — celle du
 * geste.
 */
@Injectable()
export class PrismaPublicationSequence extends PublicationSequence {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async lockProducts(ids: readonly string[]): Promise<string[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM pim.product WHERE id = ANY(${[...ids]}::text[]) ORDER BY id FOR UPDATE`;
    return rows.map((row) => row.id);
  }

  async lockCategories(ids: readonly string[]): Promise<string[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM pim.category WHERE id = ANY(${[...ids]}::text[]) ORDER BY id FOR UPDATE`;
    return rows.map((row) => row.id);
  }

  async next(): Promise<number> {
    const [row] = await this.prisma.$queryRaw<{ seq: bigint }[]>`
      SELECT nextval('pim.catalog_publication_seq') AS seq`;
    if (row === undefined) {
      throw new PublicationSequenceUnavailableError();
    }
    return Number(row.seq);
  }
}

/** La séquence n'a rien rendu : la migration `20261015200000` manque. */
export class PublicationSequenceUnavailableError extends TechnicalError {
  constructor() {
    super(
      "catalog_facts.sequence_unavailable",
      "Le numéro de publication du catalogue n'a pas pu être tiré (séquence " +
        "`pim.catalog_publication_seq` absente ?). Le geste est annulé ; appliquer les migrations " +
        "(`db:deploy`) puis le refaire.",
    );
  }
}
