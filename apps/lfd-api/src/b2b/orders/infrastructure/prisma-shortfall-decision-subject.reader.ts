import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { ShortfallDecisionSubject } from "../domain/entities/shortfall-decision.js";
import { ShortfallDecisionSubjectReader } from "../domain/ports/shortfall-decision-subject.reader.js";
import { readShortfallSubject } from "./prisma-shortfall-decision.repository.js";

/** La lecture de `lockSubject`, sans son `FOR UPDATE` (C1b, 2026-11-03). */
@Injectable()
export class PrismaShortfallDecisionSubjectReader extends ShortfallDecisionSubjectReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async subjectOf(orderId: string, rank: number): Promise<ShortfallDecisionSubject | null> {
    return (await readShortfallSubject(this.prisma, orderId, rank))?.subject ?? null;
  }
}
