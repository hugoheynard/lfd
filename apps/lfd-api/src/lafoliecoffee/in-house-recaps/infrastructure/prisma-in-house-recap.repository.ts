import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { InHouseRecap } from "../domain/entities/in-house-recap.js";
import { InHouseRecapRepository } from "../domain/ports/in-house-recap.repository.js";
import { RECAP_SELECT, toDomain } from "./in-house-recap.mapper.js";

/**
 * Le dépôt du récapitulatif. Les identifiants des lignes et des BL couverts
 * dérivent de celui du récapitulatif (rang, BL) : ils ne sont lus par
 * personne et restent stables d'une écriture à l'autre.
 */
@Injectable()
export class PrismaInHouseRecapRepository extends InHouseRecapRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(recapId: string): Promise<InHouseRecap | null> {
    const row = await this.prisma.inHouseRecap.findUnique({
      where: { id: recapId },
      select: RECAP_SELECT,
    });
    return row === null ? null : toDomain(row);
  }

  async save(recap: InHouseRecap): Promise<void> {
    const state = recap.toState();
    await this.prisma.inHouseRecap.create({
      data: {
        id: state.id,
        payerId: state.payerId,
        month: state.month.key,
        periodFrom: state.month.window().from,
        periodTo: state.month.window().to,
        number: state.number,
        issuedAt: state.issuedAt,
        storageKey: state.storageKey,
        lines: {
          createMany: {
            data: state.lines.map((line, position) => ({
              id: `${state.id}:${String(position)}`,
              position,
              ...line,
            })),
          },
        },
        notes: {
          createMany: {
            data: state.notes.map((note) => ({
              id: `${state.id}:${note.deliveryNoteId}`,
              ...note,
            })),
          },
        },
      },
    });
  }

  async saveRectification(replaced: InHouseRecap, rectified: InHouseRecap): Promise<void> {
    const old = replaced.toState();
    await this.prisma.inHouseRecapNote.updateMany({
      where: { recapId: old.id, replacedAt: null },
      data: { replacedAt: old.replacedAt },
    });
    await this.save(rectified);
    await this.prisma.inHouseRecap.update({
      where: { id: old.id },
      data: { replacedById: old.replacedById },
    });
  }
}
