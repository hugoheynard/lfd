import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { VolumeLadderAggregate } from "../domain/entities/volume-ladder.js";
import { VolumeLadderRepository } from "../domain/ports/volume-ladder.repository.js";
import { OverlappingVolumeLadderError } from "../domain/pricing-errors.js";
import { PricingActWriter } from "./pricing-act.writer.js";
import { ladderStateFromRow } from "./volume-ladder-rows.js";
import type { PricingAct } from "../domain/pricing-act.js";
import { isExclusionViolation } from "./exclusion-violation.js";

/**
 * **Le nom de la contrainte**, et non son code SQLSTATE — même raison que pour
 * les règles : l'adaptateur `pg` remonte la phrase de Postgres sans le SQLSTATE,
 * et ce nom-là est à nous, il désigne *cette* règle métier.
 */
const OVERLAP_CONSTRAINT = "volume_ladders_no_overlap";

@Injectable()
export class PrismaVolumeLadderRepository extends VolumeLadderRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acts: PricingActWriter,
  ) {
    super();
  }

  /** Le barème **et** son acte, dans la même transaction. */
  /**
   * **Les barèmes RANGÉS qui recouvrent cette fenêtre**, par identifiant.
   *
   * La contrainte d'exclusion est **partielle** (`WHERE archived_at IS NULL`) :
   * elle ne protège que du recouvrement avec un barème en cours. Poser
   * par-dessus une période rangée reste possible en base — et c'est ce qu'il
   * faut refuser quand cette période a **facturé**, sans quoi la relecture datée
   * y trouverait deux décisions concurrentes.
   *
   * ⚠️ La clé est celle du tuple d'exclusion de SA table : portée et audience, sans l'étage ni le seuil. La recopier de
   * travers rendrait un ensemble vide rassurant et faux.
   */
  async archivedOverlapping(ladder: VolumeLadderAggregate): Promise<readonly string[]> {
    const state = ladder.toPersistence();
    const rows = await this.prisma.volumeLadder.findMany({
      where: {
        archivedAt: { not: null },
        scopeType: state.scope.type,
        scopeId: state.scope.id,
        audienceType: state.audience.type,
        audienceId: state.audience.id,
        ...(state.validTo === null ? {} : { validFrom: { lt: state.validTo } }),
        OR: [{ validTo: null }, { validTo: { gt: state.validFrom } }],
      },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  async pose(ladder: VolumeLadderAggregate, act: PricingAct): Promise<void> {
    const state = ladder.toPersistence();
    try {
      await this.acts.around(act, () =>
        this.prisma.volumeLadder.create({
          data: {
            id: state.id,
            scopeType: state.scope.type,
            scopeId: state.scope.id,
            audienceType: state.audience.type,
            audienceId: state.audience.id,
            unit: state.unit,
            tiers: state.tiers.map((tier) => ({
              minQuantity: tier.minQuantity,
              value: tier.value,
            })),
            label: state.label,
            validFrom: state.validFrom,
            validTo: state.validTo,
            createdBy: state.createdBy,
          },
        }),
      );
    } catch (error) {
      if (isExclusionViolation(error, OVERLAP_CONSTRAINT)) {
        throw new OverlappingVolumeLadderError(error);
      }
      throw error;
    }
  }

  async load(id: string): Promise<VolumeLadderAggregate | null> {
    const row = await this.prisma.volumeLadder.findUnique({ where: { id } });
    return row === null ? null : VolumeLadderAggregate.reconstitute(ladderStateFromRow(row));
  }

  /** Une transition — suspendre, reprendre, archiver. Seul le cycle de vie bouge. */
  async update(ladder: VolumeLadderAggregate, act: PricingAct): Promise<void> {
    const { id, lifecycle } = ladder.toPersistence();
    await this.acts.around(act, () =>
      this.prisma.volumeLadder.update({
        where: { id },
        data: {
          pausedAt: lifecycle.pausedAt,
          pausedBy: lifecycle.pausedBy,
          archivedAt: lifecycle.archivedAt,
          archivedBy: lifecycle.archivedBy,
          archiveReason: lifecycle.archiveReason,
        },
      }),
    );
  }
}

/** Violation de la contrainte d'exclusion, duck-typée — cf. les règles. */
