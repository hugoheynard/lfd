import type { PrismaClient } from "../../../platform/database/client/client.js";
import type { IdGenerator } from "../../../platform/id/id-generator.js";
import type { Clock } from "../../../platform/time/clock.js";
import { audienceOf } from "../../promotions/domain/promotion-audience.js";
import type { PromotionAudienceFacts } from "../../promotions/domain/promotion-targeting.js";
import {
  describePolicyBackfill,
  planPolicyBackfill,
  type PolicyBackfillDecision,
  type PolicyBackfillTarget,
  type StackedPromotion,
} from "../domain/services/promotion-policy-backfill.js";
import { promotionPolicyFromRow } from "./mercuriale-rows.js";

/** L'acteur du journal tarifaire pour cette reprise. */
const ACTOR = "system:reprise-politique-promotions";

/**
 * **La reprise des politiques de promotions, en base** — lue et écrite par
 * le script `prisma/backfill-mercuriale-promotion-policies.ts`
 * (`plan-la-mercuriale-decide.md`, § 8). Le jugement est pur
 * (`planPolicyBackfill`) ; ici, la lecture et l'écriture gardée.
 *
 * L'écriture ne passe que d'« Aucune » à « Au choix », et seulement si la
 * ligne est encore à « Aucune » : rejouée, la reprise ne touche plus rien.
 */
export class PrismaPromotionPolicyBackfill {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  /** Le plan : mercuriales en cours ou à venir, puis brouillons. */
  async plan(): Promise<readonly PolicyBackfillDecision[]> {
    const now = this.clock.now();
    const [stacked, mercuriales, drafts] = await Promise.all([
      this.stackedPromotions(),
      this.prisma.companyMercuriale.findMany({
        where: { archivedAt: null, OR: [{ validTo: null }, { validTo: { gt: now } }] },
        orderBy: [{ companyId: "asc" }, { validFrom: "asc" }],
        include: { amendments: { where: { archivedAt: null, promotionMode: { not: null } } } },
      }),
      this.prisma.mercurialeDraft.findMany({ orderBy: { companyId: "asc" } }),
    ]);
    const companies = [
      ...new Set([
        ...mercuriales.map((row) => row.companyId),
        ...drafts.map((row) => row.companyId),
      ]),
    ];
    const facts = await this.factsOf(companies);
    const targets: PolicyBackfillTarget[] = [
      ...mercuriales.map((row) => ({
        kind: "mercuriale" as const,
        id: row.id,
        companyId: row.companyId,
        label: row.label,
        current: promotionPolicyFromRow(row.id, row.promotionMode, row.promotionIds),
        decidedByAmendment: row.amendments.length > 0,
        facts: facts.get(row.companyId) ?? unknownCompany(row.companyId),
      })),
      ...drafts.map((row) => ({
        kind: "draft" as const,
        id: row.companyId,
        companyId: row.companyId,
        label: row.label,
        current: promotionPolicyFromRow(row.companyId, row.promotionMode, row.promotionIds),
        decidedByAmendment: false,
        facts: facts.get(row.companyId) ?? unknownCompany(row.companyId),
      })),
    ];
    return planPolicyBackfill(targets, stacked);
  }

  /** Écrit une décision `set` ; rend `false` si la ligne a changé entre-temps. */
  async apply(decision: PolicyBackfillDecision): Promise<boolean> {
    if (decision.outcome !== "set") {
      return false;
    }
    const { target, policy } = decision;
    const data = { promotionMode: policy.mode, promotionIds: [...policy.promotionIds] };
    if (target.kind === "draft") {
      const written = await this.prisma.mercurialeDraft.updateMany({
        where: { companyId: target.id, promotionMode: "none" },
        data,
      });
      return written.count === 1;
    }
    return this.prisma.$transaction(async (tx) => {
      const written = await tx.companyMercuriale.updateMany({
        where: { id: target.id, promotionMode: "none", archivedAt: null },
        data,
      });
      if (written.count !== 1) {
        return false;
      }
      await tx.pricingEvent.create({
        data: {
          id: this.ids.next(),
          subjectType: "mercuriale",
          subjectId: target.id,
          act: "amended",
          actor: ACTOR,
          occurredAt: this.clock.now(),
          reason: "Reprise : promotions cochées « aussi pour les tarifs négociés »",
          summary: `Reprise — ${describePolicyBackfill(decision)}`,
        },
      });
      return true;
    });
  }

  private async stackedPromotions(): Promise<StackedPromotion[]> {
    const rows = await this.prisma.promotion.findMany({
      where: { stacksOverMercuriale: true, archivedAt: null },
      select: {
        id: true,
        internalName: true,
        audienceTargets: { select: { kind: true, companyId: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      internalName: row.internalName,
      audiences: row.audienceTargets.flatMap((target) => {
        const audience = audienceOf(target.kind, target.companyId);
        return audience === null ? [] : [audience];
      }),
    }));
  }

  private async factsOf(
    companyIds: readonly string[],
  ): Promise<ReadonlyMap<string, PromotionAudienceFacts>> {
    const rows = await this.prisma.company.findMany({
      where: { id: { in: [...companyIds] } },
      select: { id: true, status: true, parentCompanyId: true },
    });
    return new Map(
      rows.map((row) => [
        row.id,
        {
          companyId: row.id,
          companyStatus: row.status,
          principal: { companyId: row.parentCompanyId },
          buyerKind: "registered",
          fulfillment: null,
        },
      ]),
    );
  }
}

/** Une société que l'annuaire ne connaît plus : seuls les publics nominatifs la visent. */
function unknownCompany(companyId: string): PromotionAudienceFacts {
  return {
    companyId,
    companyStatus: null,
    principal: { companyId: null },
    buyerKind: "registered",
    fulfillment: null,
  };
}
