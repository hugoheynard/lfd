import { Injectable } from "@nestjs/common";

import { IdGenerator } from "../../../platform/id/id-generator.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { PricingRule } from "../domain/entities/pricing-rule.js";
import { PricingRuleRepository } from "../domain/ports/pricing-rule.repository.js";
import { OverlappingPriceRuleError } from "../domain/pricing-errors.js";
import { eventRow } from "./pricing-journal.writer.js";
import { ruleStateFromRow, type RuleRow } from "./price-rows.js";
import type { PricingAct } from "../domain/pricing-act.js";

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGenerator,
  ) {
    super();
  }

  /**
   * La règle **et** son acte, dans la même transaction — c'est ce qui permet
   * d'affirmer « aucun changement sans sa trace ». Deux écritures séparées se
   * seraient désolidarisées au premier incident, et le journal manquant serait
   * précisément celui de la nuit où quelque chose s'est mal passé.
   *
   * @throws {OverlappingPriceRuleError} une règle aussi spécifique couvre déjà
   *   tout ou partie de cette fenêtre. C'est la contrainte d'exclusion qui parle,
   *   et sa réponse est traduite plutôt qu'avalée : le staff doit savoir laquelle
   *   des deux il est en train de dupliquer.
   */
  async save(rule: PricingRule, act: PricingAct): Promise<void> {
    try {
      await this.prisma.$transaction([
        this.prisma.priceRule.create({ data: ruleData(rule) }),
        this.prisma.pricingEvent.create({ data: eventRow(this.ids.next(), act) }),
      ]);
    } catch (error) {
      if (isExclusionViolation(error)) {
        throw new OverlappingPriceRuleError(rule.toPersistence().stage, error);
      }
      throw error;
    }
  }

  /** Une transition — pause, reprise, archivage. Seul le cycle de vie bouge. */
  async update(rule: PricingRule, act: PricingAct): Promise<void> {
    const { id, lifecycle } = rule.toPersistence();
    await this.prisma.$transaction([
      this.prisma.priceRule.update({
        where: { id },
        data: {
          pausedAt: lifecycle.pausedAt,
          pausedBy: lifecycle.pausedBy,
          archivedAt: lifecycle.archivedAt,
          archivedBy: lifecycle.archivedBy,
          archiveReason: lifecycle.archiveReason,
        },
      }),
      this.prisma.pricingEvent.create({ data: eventRow(this.ids.next(), act) }),
    ]);
  }

  /**
   * Le renommage : **une seule colonne**, plus l'acte.
   *
   * Écrire ici l'effet ou la fenêtre serait techniquement trivial, et c'est
   * précisément pour ça que cette méthode ne prend pas de raccourci : ce qu'elle
   * n'écrit pas est ce qu'elle garantit.
   */
  async rename(rule: PricingRule, act: PricingAct): Promise<void> {
    const { id, label } = rule.toPersistence();
    await this.prisma.$transaction([
      this.prisma.priceRule.update({ where: { id }, data: { label } }),
      this.prisma.pricingEvent.create({ data: eventRow(this.ids.next(), act) }),
    ]);
  }

  /**
   * Charge la règle **quel que soit son état**, archivée comprise : c'est
   * l'agrégat qui refuse un geste sur une décision close, pas la requête. Filtrer
   * ici rendrait un 404 là où la bonne réponse est « elle est archivée ».
   */
  async load(id: string): Promise<PricingRule | null> {
    const row = await this.prisma.priceRule.findUnique({ where: { id } });
    return row === null ? null : PricingRule.reconstitute(ruleStateFromRow(row));
  }
}

/** L'agrégat, à plat. Les colonnes de cycle de vie restent nulles à la pose. */
function ruleData(
  rule: PricingRule,
): Omit<
  RuleRow,
  "createdAt" | "pausedAt" | "pausedBy" | "archivedAt" | "archivedBy" | "archiveReason"
> {
  const state = rule.toPersistence();
  const effect = state.effect;
  const alteration = effect.nature === "alter" ? effect.alteration : null;
  return {
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
    stacksOverMercuriale: state.stacksOverMercuriale,
    createdBy: state.createdBy,
  };
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
