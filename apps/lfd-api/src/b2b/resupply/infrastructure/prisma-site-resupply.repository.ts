import { Injectable } from "@nestjs/common";

import { isUniqueViolation } from "../../../platform/database/json-columns.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { type ResupplyTarget, SiteResupply } from "../domain/site-resupply.js";
import {
  SiteResupplyChangedMeanwhileError,
  SiteResupplyAlreadyWrittenError,
  SiteResupplyDraftOpenedMeanwhileError,
} from "../domain/site-resupply-errors.js";
import { SiteResupplyRepository } from "../domain/site-resupply.repository.js";
import { dayColumn, SITE_RESUPPLY_LINES, snapshotOf } from "./site-resupply.row.js";

/** Le nom (R1g) et les colonnes des trois gestes datés (l'arrivée depuis R3e), `null` tant qu'ils n'ont pas eu lieu. */
function tracesOf(resupply: SiteResupply) {
  const { placed, cancelled, arrived } = resupply;
  // Le lancement (R4a) n'est qu'un affichage, posé par le fait du fournil.
  return {
    name: resupply.name,
    placedAt: placed?.at ?? null,
    placedByStaffId: placed?.author.staffUserId ?? null,
    placedByName: placed?.author.name ?? null,
    placedByRole: placed?.author.role ?? null,
    cancelledAt: cancelled?.at ?? null,
    cancelledByStaffId: cancelled?.author.staffUserId ?? null,
    cancelledByName: cancelled?.author.name ?? null,
    cancelledByRole: cancelled?.author.role ?? null,
    arrivedAt: arrived?.at ?? null,
    arrivedByStaffId: arrived?.author.staffUserId ?? null,
    arrivedByName: arrived?.author.name ?? null,
    arrivedByRole: arrived?.author.role ?? null,
    launchedAt: resupply.launched?.at ?? null,
    launchedByName: resupply.launched?.byName ?? null,
    departedAt: resupply.departed?.at ?? null,
    departedByName: resupply.departed?.byName ?? null,
  };
}

function linesOf(resupply: SiteResupply) {
  return resupply.lines.map((line, position) => ({
    sku: line.sku,
    label: line.label,
    quantity: line.quantity,
    position,
  }));
}

/**
 * Adaptateur Prisma du réassort (`site_resupply` + ses lignes). Un réassort
 * neuf s'insère — l'index unique partiel refuse une seconde demande en
 * cours pour la même visée, en 409 ; ensuite il se réécrit sous le verrou de
 * la version lue. Les lignes sont des parties de l'agrégat : tant qu'il n'est
 * pas annulé, elles se réécrivent avec lui (le brouillon les fait bouger,
 * l'envoi les fige). L'agrégat, lui, ne se supprime jamais.
 */
@Injectable()
export class PrismaSiteResupplyRepository extends SiteResupplyRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(siteId: string, resupplyId: string): Promise<SiteResupply | null> {
    // Le point est dans le `where` : c'est le mur par point.
    const row = await this.prisma.siteResupply.findFirst({
      where: { id: resupplyId, siteId },
      include: { lines: SITE_RESUPPLY_LINES },
    });
    return row === null ? null : SiteResupply.restore(snapshotOf(row));
  }

  async openDraft(
    siteId: string,
    target: ResupplyTarget,
    serviceDay: string,
  ): Promise<SiteResupply | null> {
    const row = await this.prisma.siteResupply.findFirst({
      // Le fournil n'a pas de brouillon (CHECK `site_resupply_bakehouse_placed`) :
      // l'origine dit seulement en clair que c'est celle du comptoir.
      where: {
        siteId,
        target,
        serviceDay: dayColumn(serviceDay),
        origin: "counter",
        placedAt: null,
      },
      include: { lines: SITE_RESUPPLY_LINES },
    });
    return row === null ? null : SiteResupply.restore(snapshotOf(row));
  }

  async save(resupply: SiteResupply): Promise<void> {
    if (resupply.version === 0) {
      await this.create(resupply);
      return;
    }
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.siteResupply.updateMany({
        where: { id: resupply.id, siteId: resupply.siteId, version: resupply.version },
        data: { version: resupply.version + 1, ...tracesOf(resupply) },
      });
      if (count === 0) {
        throw new SiteResupplyChangedMeanwhileError();
      }
      if (resupply.status === "cancelled") {
        return;
      }
      await tx.siteResupplyLine.deleteMany({ where: { resupplyId: resupply.id } });
      await tx.siteResupplyLine.createMany({
        data: linesOf(resupply).map((line) => ({ resupplyId: resupply.id, ...line })),
      });
    });
  }

  private async create(resupply: SiteResupply): Promise<void> {
    try {
      await this.prisma.siteResupply.create({
        data: {
          id: resupply.id,
          siteId: resupply.siteId,
          target: resupply.target,
          serviceDay: dayColumn(resupply.serviceDay),
          origin: resupply.origin,
          ...tracesOf(resupply),
          lines: { create: linesOf(resupply) },
        },
      });
    } catch (error) {
      // Un brouillon : l'index de la demande en cours. Un envoyé : sa clé
      // primaire, qu'un même envoi rejoué en même temps a déjà écrite (A1.4).
      if (isUniqueViolation(error)) {
        throw resupply.placed === null
          ? new SiteResupplyDraftOpenedMeanwhileError()
          : new SiteResupplyAlreadyWrittenError(resupply.id);
      }
      throw error;
    }
  }
}
