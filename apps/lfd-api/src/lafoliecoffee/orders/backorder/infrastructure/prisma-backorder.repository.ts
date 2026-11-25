import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../../platform/database/prisma.service.js";
import type { Backorder } from "../domain/entities/backorder.js";
import { BackorderRepository } from "../domain/ports/backorder.repository.js";
import { BACKORDER_SELECT, backorderLinesJson, backorderOf } from "./backorder.mapper.js";

/**
 * L'adaptateur du reliquat, par le client routé (dans l'unité de travail de
 * l'appelant quand il y en a une). Les lignes ne bougent plus après la
 * naissance : `save` ne réécrit que le sort.
 */
@Injectable()
export class PrismaBackorderRepository extends BackorderRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(id: string): Promise<Backorder | null> {
    const row = await this.prisma.backorder.findUnique({ where: { id }, select: BACKORDER_SELECT });
    return row === null ? null : backorderOf(row);
  }

  async loadLocked(id: string): Promise<Backorder | null> {
    await this.prisma.$queryRaw`
      SELECT "id" FROM "public"."backorder" WHERE "id" = ${id} FOR UPDATE`;
    return this.load(id);
  }

  async save(backorder: Backorder): Promise<void> {
    const state = backorder.toSnapshot();
    const fate = {
      state: state.state,
      convertedOrderId: state.convertedOrderId,
      closedAt: state.closedAt,
      closedByStaffId: state.closedByStaffId,
    };
    await this.prisma.backorder.upsert({
      where: { id: state.id },
      create: {
        id: state.id,
        originOrderId: state.originOrderId,
        companyId: state.companyId,
        buyerUserId: state.buyerUserId,
        lines: backorderLinesJson(state.lines),
        createdAt: state.createdAt,
        ...fate,
      },
      update: fate,
    });
  }
}
