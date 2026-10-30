import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { Journal } from "../../../platform/journal/journal.js";
import { PromotionRepository } from "../domain/ports/promotion.repository.js";
import { PROMOTION_SUBJECT, type PromotionAct } from "../domain/promotion-act.js";
import type { Promotion } from "../domain/promotion.js";
import { scopeRuleRowsOf, toDomain, toPersistence } from "./promotion-rows.js";

/**
 * **L'adaptateur Prisma de l'agrégat `Promotion`.** Il ne tient aucune
 * règle : elles sont dans l'agrégat. Il écrit l'état, la portée remplacée en
 * bloc, l'acte dans `pricing_events` (sujet `promotion`, § 13.9) et son miroir
 * au journal général — une seule transaction : l'état sans sa trace n'existe
 * pas.
 */
@Injectable()
export class PrismaPromotionRepository extends PromotionRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uow: UnitOfWork,
    private readonly ids: IdGenerator,
    private readonly journal: Journal,
  ) {
    super();
  }

  async load(id: string): Promise<Promotion | null> {
    const row = await this.prisma.promotion.findUnique({
      where: { id },
      include: { scopeRules: { orderBy: [{ target: "asc" }, { targetId: "asc" }] } },
    });
    return row === null ? null : toDomain(row, row.scopeRules);
  }

  async save(promotion: Promotion, act: PromotionAct): Promise<void> {
    const data = toPersistence(promotion);
    await this.uow.run(async () => {
      await this.prisma.promotion.upsert({
        where: { id: promotion.id },
        create: data,
        update: data,
      });
      // Les règles sont des valeurs de la portée, sans histoire propre : le
      // journal porte l'histoire.
      await this.prisma.promotionScopeRule.deleteMany({ where: { promotionId: promotion.id } });
      const rules = scopeRuleRowsOf(promotion);
      if (rules.length > 0) {
        await this.prisma.promotionScopeRule.createMany({ data: rules });
      }
      await this.inscribe(act);
    });
  }

  private async inscribe(act: PromotionAct): Promise<void> {
    await this.prisma.pricingEvent.create({
      data: {
        id: this.ids.next(),
        subjectType: PROMOTION_SUBJECT,
        subjectId: act.subjectId,
        act: act.kind,
        actor: act.actor,
        occurredAt: act.at,
        reason: act.reason,
        summary: act.summary,
      },
    });
    await this.journal.append({
      type: `promotion.${act.kind}`,
      subjectType: PROMOTION_SUBJECT,
      subjectId: act.subjectId,
      payload: { subjectLabel: act.subjectLabel, summary: act.summary, reason: act.reason },
      occurredAt: act.at,
    });
  }
}
