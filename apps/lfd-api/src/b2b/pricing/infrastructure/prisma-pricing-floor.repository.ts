import { Injectable } from "@nestjs/common";

import { IdGenerator } from "../../../platform/id/id-generator.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { PricingFloorRepository } from "../domain/ports/pricing-floor.repository.js";
import { PricingFloor } from "../domain/entities/pricing-floor.js";
import { floorFromRow } from "./price-rows.js";
import { eventRow } from "./pricing-journal.writer.js";
import type { PricingAct } from "../domain/pricing-act.js";
import type { PriceFloor } from "../domain/price-rule.js";

@Injectable()
export class PrismaPricingFloorRepository extends PricingFloorRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGenerator,
  ) {
    super();
  }

  /**
   * Un `upsert` sur la **clé primaire**, et c'est possible uniquement parce que
   * l'identifiant est dérivé de la portée : pas de lecture préalable, donc pas de
   * fenêtre entre « je regarde s'il existe » et « je l'écris ».
   */
  async pose(floor: PricingFloor, act: PricingAct): Promise<void> {
    const state = floor.toPersistence();
    const dynamic = state.policy.dynamic;
    const shared = {
      scopeType: state.scope.type,
      scopeId: state.scope.id,
      mode: state.policy.hard.mode,
      value: magnitudeOf(state.policy.hard),
      // Toutes les colonnes de la porte sont écrites, y compris à `null` : un
      // `upsert` qui les omettrait laisserait la porte d'une version précédente
      // en place, et le plancher dur deviendrait contournable sans que personne
      // ne l'ait décidé.
      dynamicMode: dynamic?.floor.mode ?? null,
      dynamicValue: dynamic === null ? null : magnitudeOf(dynamic.floor),
      unlockMinQuantity: dynamic?.unlock.minQuantity ?? null,
      unlockMinVolumeRatioBp: dynamic?.unlock.minVolumeRatioBp ?? null,
      // Re-posée = re-décidée : la référence se rafraîchit, et l'écart repart
      // de zéro. C'est exactement ce qu'on veut d'une confirmation — sans quoi
      // le signal ne s'éteindrait jamais et on apprendrait à l'ignorer.
      referenceCanonicalCents: state.referenceCanonicalCents,
      createdBy: state.createdBy,
      // Re-poser sur une portée archivée la REND : c'est une nouvelle décision,
      // avec son auteur et sa date, et l'histoire de la portée reste lisible
      // dans le journal. Laisser `archived_at` en place aurait donné une limite
      // qui protège et qui se dit retirée.
      archivedAt: null,
      archivedBy: null,
      archiveReason: null,
    };

    await this.prisma.$transaction([
      this.prisma.priceFloor.upsert({
        where: { id: state.id },
        create: { id: state.id, ...shared },
        update: shared,
      }),
      this.prisma.pricingEvent.create({ data: eventRow(this.ids.next(), act) }),
    ]);
  }

  /** La limite **en vigueur** : une limite archivée n'en est plus une. */
  async load(id: string): Promise<PricingFloor | null> {
    const row = await this.prisma.priceFloor.findFirst({ where: { id, archivedAt: null } });
    if (row === null) {
      return null;
    }
    const scoped = floorFromRow(row);
    return PricingFloor.reconstitute({
      id: scoped.id,
      scope: scoped.scope,
      policy: scoped.policy,
      createdBy: row.createdBy,
      referenceCanonicalCents: row.referenceCanonicalCents,
    });
  }

  /**
   * **Archive**, jamais `DELETE`. Le `where` porte sur `archivedAt: null` : ré-
   * archiver une limite déjà retirée rend `false`, donc un 404 — deux personnes
   * peuvent avoir le même écran ouvert, et la seconde doit savoir que son geste
   * n'a rien fait.
   */
  async archive(id: string, act: PricingAct): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.priceFloor.updateMany({
        where: { id, archivedAt: null },
        data: { archivedAt: act.at, archivedBy: act.actor, archiveReason: act.reason },
      });
      // Transaction INTERACTIVE et non tableau : sans elle, un archivage qui ne
      // trouve rien écrirait quand même son acte, et le journal raconterait un
      // geste qui n'a rien fait.
      if (count === 0) {
        return false;
      }
      await tx.pricingEvent.create({ data: eventRow(this.ids.next(), act) });
      return true;
    });
  }
}

function magnitudeOf(floor: PriceFloor): number {
  return floor.mode === "percent" ? floor.bp : floor.cents;
}
