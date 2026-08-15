import {
  orderDraftPayloadSchema,
  type OrderDraftPayload,
  type OrderDraftView,
} from "@lfd/contracts";
import { Injectable } from "@nestjs/common";
import type { Prisma } from "../../infra/database/client/client.js";

import { PrismaService } from "../../infra/database/prisma.service.js";
import { OrderDraftRepository } from "../domain/ports/order-draft.repository.js";

/** Une ligne de `order_drafts` telle qu'on la relit. */
interface DraftRow {
  readonly companyId: string;
  readonly payload: Prisma.JsonValue;
  readonly savedByStaffId: string | null;
  readonly updatedAt: Date;
}

/**
 * Le brouillon en Postgres, dans une colonne `jsonb`.
 *
 * **Validé à la relecture, pas seulement à l'écriture.** Le contenu d'une
 * colonne JSON n'a pas de garantie de forme : un brouillon écrit par une
 * version précédente de l'écran repasse par le schéma, et ses champs manquants
 * reprennent leurs valeurs par défaut. Un brouillon illisible est rendu `null` —
 * repartir d'un écran vide vaut mieux qu'une saisie à moitié restaurée.
 */
@Injectable()
export class PrismaOrderDraftRepository extends OrderDraftRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async find(companyId: string): Promise<OrderDraftView | null> {
    const row = await this.prisma.orderDraft.findUnique({
      where: { companyId },
      select: SELECT,
    });
    return row === null ? null : toView(row);
  }

  async save(
    companyId: string,
    payload: OrderDraftPayload,
    savedByStaffId: string | null,
  ): Promise<OrderDraftView> {
    const data = { payload, savedByStaffId } satisfies Prisma.OrderDraftUpdateInput;
    const row = await this.prisma.orderDraft.upsert({
      where: { companyId },
      create: { companyId, ...data },
      update: data,
      select: SELECT,
    });
    // La vue est construite depuis ce qu'on VIENT d'écrire, sans le relire :
    // repasser par `toView` rendrait un type nullable pour un cas impossible.
    return {
      ...payload,
      companyId,
      savedAt: row.updatedAt.toISOString(),
      savedByStaffId: row.savedByStaffId,
    };
  }

  async discard(companyId: string): Promise<void> {
    await this.prisma.orderDraft.deleteMany({ where: { companyId } });
  }
}

const SELECT = {
  companyId: true,
  payload: true,
  savedByStaffId: true,
  updatedAt: true,
} as const;

/** `null` quand le contenu stocké n'a plus la forme attendue — cf. la classe. */
function toView(row: DraftRow): OrderDraftView | null {
  const parsed = orderDraftPayloadSchema.safeParse(row.payload);
  if (!parsed.success) {
    return null;
  }
  return {
    ...parsed.data,
    companyId: row.companyId,
    savedAt: row.updatedAt.toISOString(),
    savedByStaffId: row.savedByStaffId,
  };
}
