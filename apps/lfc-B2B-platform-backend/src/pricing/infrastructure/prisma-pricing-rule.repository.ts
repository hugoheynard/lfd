import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../infra/database/prisma.service.js";
import { PricingRuleRepository } from "../domain/ports/pricing-rule.repository.js";
import { OverlappingPriceRuleError } from "../domain/pricing-errors.js";
import type { PricingRule } from "../domain/entities/pricing-rule.js";

/**
 * **Le nom de la contrainte**, et non son code SQLSTATE.
 *
 * Le premier essai guettait `23P01`. Il ne marchait pas : l'adaptateur `pg` de
 * Prisma remonte un `DriverAdapterError` dont le message porte la phrase de
 * Postgres — « conflicting key value violates exclusion constraint
 * "price_rules_no_overlap" » — mais **pas** le SQLSTATE, ni dans le message ni
 * dans `meta`. Seul l'e2e l'a montré ; aucun test unitaire ne pouvait le dire,
 * puisque la forme de l'erreur appartient au driver.
 *
 * Guetter le nom est aussi plus juste : ce nom est à nous, il vit dans la
 * migration d'à côté, et il désigne *cette* règle métier. Un SQLSTATE désignerait
 * n'importe quelle contrainte d'exclusion de la base.
 */
const OVERLAP_CONSTRAINT = "price_rules_no_overlap";

@Injectable()
export class PrismaPricingRuleRepository extends PricingRuleRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * @throws {OverlappingPriceRuleError} une règle aussi spécifique couvre déjà
   *   tout ou partie de cette fenêtre. C'est la contrainte d'exclusion qui parle,
   *   et sa réponse est traduite plutôt qu'avalée : le staff doit savoir laquelle
   *   des deux il est en train de dupliquer.
   */
  async save(rule: PricingRule): Promise<void> {
    const state = rule.toPersistence();
    const effect = state.effect;
    const alteration = effect.nature === "alter" ? effect.alteration : null;

    try {
      await this.prisma.priceRule.create({
        data: {
          id: state.id,
          stage: state.stage,
          nature: effect.nature,
          scopeType: state.scope.type,
          scopeId: state.scope.id,
          audienceType: state.audience.type,
          audienceId: state.audience.id,
          minQuantity: state.minQuantity,
          amountCents: effect.nature === "replace" ? effect.amountCents : null,
          direction: alteration?.direction ?? null,
          mode: alteration?.mode ?? null,
          value: alteration === null ? null : magnitudeOf(alteration),
          validFrom: state.validFrom,
          validTo: state.validTo,
          label: state.label,
          createdBy: state.createdBy,
        },
      });
    } catch (error) {
      if (isExclusionViolation(error)) {
        throw new OverlappingPriceRuleError(state.stage, error);
      }
      throw error;
    }
  }

  async remove(id: string): Promise<boolean> {
    const { count } = await this.prisma.priceRule.deleteMany({ where: { id } });
    return count > 0;
  }
}

function magnitudeOf(
  alteration: { mode: "percent"; bp: number } | { mode: "amount"; cents: number },
): number {
  return alteration.mode === "percent" ? alteration.bp : alteration.cents;
}

/**
 * Violation de la contrainte d'exclusion, duck-typée — sans importer le client
 * Prisma ni ses classes d'erreur, comme ailleurs dans ce code.
 *
 * On remonte la chaîne des `cause` : l'adaptateur emballe l'erreur du driver, et
 * selon les versions la phrase de Postgres se trouve à un niveau ou à un autre.
 * Chercher au seul niveau du dessus marcherait aujourd'hui et casserait en
 * silence à la prochaine montée de version — en rendant un 500 là où le staff
 * lisait une phrase.
 */
function isExclusionViolation(error: unknown): boolean {
  for (let current = error, depth = 0; current !== null && depth < 5; depth += 1) {
    if (typeof current !== "object") {
      return false;
    }
    const message: unknown = Reflect.get(current, "message");
    if (typeof message === "string" && message.includes(OVERLAP_CONSTRAINT)) {
      return true;
    }
    current = Reflect.get(current, "cause");
  }
  return false;
}
