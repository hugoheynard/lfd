import { isJsonRecord } from "../../../platform/database/json-columns.js";
import { UnreadablePromotionRowError } from "../domain/errors/promotion-errors.js";
import {
  audienceLabelOf,
  audienceProjectionOf,
  audiencesOf,
  type PromotionAudienceTargetRow,
} from "./promotion-audience-rows.js";
import type { PromotionCondition } from "../domain/promotion-condition.js";
import { effectOf, effectValueOf, type PromotionOwnFloor } from "../domain/promotion-effect.js";
import { fulfillmentOf, fulfillmentPickupIdOf } from "../domain/promotion-fulfillment.js";
import {
  PROMOTION_SCOPE_TARGETS,
  type PromotionScopeMode,
  type PromotionScopeRule,
  type PromotionScopeTarget,
} from "../domain/promotion-scope.js";
import { Promotion, type PromotionOrigin, type PromotionState } from "../domain/promotion.js";

/**
 * **Les deux mappers de l'agrégat `Promotion`** — ligne ↔ domaine. Aucun type
 * `Prisma.*` n'en sort : les lignes sont décrites ici, à la main, par ce que
 * le dépôt sélectionne.
 */

export interface PromotionRow {
  readonly id: string;
  readonly internalName: string;
  readonly labelFr: string;
  readonly labelEn: string | null;
  readonly labelIt: string | null;
  readonly labelIndividualsFr: string | null;
  readonly labelIndividualsEn: string | null;
  readonly labelIndividualsIt: string | null;
  readonly labelProsFr: string | null;
  readonly labelProsEn: string | null;
  readonly labelProsIt: string | null;
  readonly reason: string | null;
  readonly applicationPoint: string;
  readonly effectKind: string;
  readonly effectValue: number;
  readonly ownFloorMode: string | null;
  readonly ownFloorValue: number | null;
  readonly stacksOverMercuriale: boolean;
  readonly validFrom: Date;
  readonly validTo: Date | null;
  readonly pausedAt: Date | null;
  readonly pausedBy: string | null;
  readonly archivedAt: Date | null;
  readonly archivedBy: string | null;
  readonly archiveReason: string | null;
  /** Projection de la table des cibles, qui fait foi (L8b) — jamais relue. */
  readonly audienceKind: string;
  readonly audienceCompanyId: string | null;
  readonly fulfillmentKind: string;
  readonly fulfillmentPickupId: string | null;
  readonly scopeMode: string;
  readonly conditions: unknown;
  readonly origin: unknown;
  readonly legacySource: string | null;
  readonly createdBy: string;
  readonly createdAt: Date;
}

/**
 * Ce que le dépôt ÉCRIT : la ligne sans `origin`, que seule la reprise SQL
 * (L4) pose et qu'aucun geste ne change — une saisie naît donc à `NULL`.
 */
export type PromotionWriteRow = Omit<PromotionRow, "conditions" | "origin"> & {
  readonly conditions: readonly { readonly kind: string; readonly value: number }[];
};

export interface PromotionScopeRuleRow {
  readonly id: string;
  readonly promotionId: string;
  readonly target: string;
  readonly targetId: string;
  readonly targetRank: number | null;
  readonly eligible: boolean;
}

/**
 * **Ligne → agrégat**, revalidé par `Promotion.restore` : une ligne écrite en
 * SQL (la reprise) qui contournerait un invariant est refusée ici, nommée.
 *
 * Le public se lit dans **la table des cibles** (L8b) ; une promotion sans
 * cible est illisible — jamais de repli sur `audience_kind`, qui n'est
 * qu'une projection : ce serait une valeur inventée.
 *
 * @throws {UnreadablePromotionRowError} une valeur que le domaine ne connaît pas.
 * @throws les refus de l'agrégat.
 */
export function toDomain(
  row: PromotionRow,
  rules: readonly PromotionScopeRuleRow[],
  targets: readonly PromotionAudienceTargetRow[],
): Promotion {
  const unreadable = (detail: string) => new UnreadablePromotionRowError(row.id, detail);
  const effect = effectOf(row.effectKind, row.effectValue);
  const fulfillment = fulfillmentOf(row.fulfillmentKind, row.fulfillmentPickupId);
  if (effect === null || fulfillment === null) {
    throw unreadable("effet ou acheminement inconnu");
  }
  const promotion = Promotion.restore({
    id: row.id,
    internalName: row.internalName,
    label: { fr: row.labelFr, en: row.labelEn, it: row.labelIt },
    audienceLabels: {
      individuals: audienceLabelOf(
        row.labelIndividualsFr,
        row.labelIndividualsEn,
        row.labelIndividualsIt,
      ),
      pros: audienceLabelOf(row.labelProsFr, row.labelProsEn, row.labelProsIt),
    },
    reason: row.reason,
    effect,
    ownFloor: ownFloorOf(row, unreadable),
    stacksOverMercuriale: row.stacksOverMercuriale,
    validFrom: row.validFrom,
    validTo: row.validTo,
    audiences: audiencesOf(targets, unreadable),
    fulfillment,
    scope: {
      mode: scopeModeOf(row.scopeMode, unreadable),
      rules: rules.map((r) => ruleOf(r, unreadable)),
    },
    conditions: conditionsOf(row.conditions, unreadable),
    paused: pauseOf(row, unreadable),
    archived: archiveOf(row, unreadable),
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    origin: originOf(row.origin, unreadable),
    legacySource: row.legacySource,
  });
  if (promotion.applicationPoint !== row.applicationPoint) {
    throw unreadable(`point d'application ${row.applicationPoint} contraire à l'acheminement`);
  }
  return promotion;
}

/**
 * **Agrégat → ligne**, sans sa portée, ses cibles ni son origine. Le public y
 * est PROJETÉ (L8b) : une cible ⇒ cette cible, plusieurs ⇒ `several`.
 */
export function toPersistence(promotion: Promotion): PromotionWriteRow {
  const state: PromotionState = promotion.toPersistence();
  return {
    id: state.id,
    internalName: state.internalName,
    labelFr: state.label.fr,
    labelEn: state.label.en,
    labelIt: state.label.it,
    labelIndividualsFr: state.audienceLabels.individuals?.fr ?? null,
    labelIndividualsEn: state.audienceLabels.individuals?.en ?? null,
    labelIndividualsIt: state.audienceLabels.individuals?.it ?? null,
    labelProsFr: state.audienceLabels.pros?.fr ?? null,
    labelProsEn: state.audienceLabels.pros?.en ?? null,
    labelProsIt: state.audienceLabels.pros?.it ?? null,
    reason: state.reason,
    applicationPoint: promotion.applicationPoint,
    effectKind: state.effect.kind,
    effectValue: effectValueOf(state.effect),
    ownFloorMode: state.ownFloor?.mode ?? null,
    ownFloorValue: state.ownFloor?.value ?? null,
    stacksOverMercuriale: state.stacksOverMercuriale,
    validFrom: state.validFrom,
    validTo: state.validTo,
    pausedAt: state.paused?.at ?? null,
    pausedBy: state.paused?.by ?? null,
    archivedAt: state.archived?.at ?? null,
    archivedBy: state.archived?.by ?? null,
    archiveReason: state.archived?.reason ?? null,
    ...audienceProjectionOf(state.audiences.targets),
    fulfillmentKind: state.fulfillment.kind,
    fulfillmentPickupId: fulfillmentPickupIdOf(state.fulfillment),
    scopeMode: state.scope.mode,
    conditions: state.conditions.map((condition) => ({ ...condition })),
    legacySource: state.legacySource,
    createdBy: state.createdBy,
    createdAt: state.createdAt,
  };
}

/**
 * Les règles de portée, à identifiant **composé** — la règle que la reprise
 * SQL suit aussi (§ 13.4) : `promotion_id:target:target_id`, unique par la
 * contrainte de la table, stable d'une écriture à l'autre.
 */
export function scopeRuleRowsOf(promotion: Promotion): PromotionScopeRuleRow[] {
  return promotion.terms.scope.rules.map((rule) => ({
    id: `${promotion.id}:${rule.target}:${rule.targetId}`,
    promotionId: promotion.id,
    target: rule.target,
    targetId: rule.targetId,
    targetRank: rule.targetRank,
    eligible: rule.eligible,
  }));
}

type Unreadable = (detail: string) => UnreadablePromotionRowError;

function ownFloorOf(row: PromotionRow, unreadable: Unreadable): PromotionOwnFloor | null {
  if (row.ownFloorMode === null || row.ownFloorValue === null) {
    return null;
  }
  if (row.ownFloorMode !== "percent" && row.ownFloorMode !== "amount") {
    throw unreadable(`plancher propre ${row.ownFloorMode}`);
  }
  return { mode: row.ownFloorMode, value: row.ownFloorValue };
}

function scopeModeOf(mode: string, unreadable: Unreadable): PromotionScopeMode {
  if (mode !== "all_except" && mode !== "only") {
    throw unreadable(`mode de portée ${mode}`);
  }
  return mode;
}

function ruleOf(row: PromotionScopeRuleRow, unreadable: Unreadable): PromotionScopeRule {
  const target = PROMOTION_SCOPE_TARGETS.find(
    (known): known is PromotionScopeTarget => known === row.target,
  );
  if (target === undefined) {
    throw unreadable(`cible de portée ${row.target}`);
  }
  return { target, targetId: row.targetId, eligible: row.eligible, targetRank: row.targetRank };
}

function conditionsOf(value: unknown, unreadable: Unreadable): PromotionCondition[] {
  if (!Array.isArray(value)) {
    throw unreadable("conditions qui ne sont pas une liste");
  }
  return value.map((entry: unknown): PromotionCondition => {
    if (
      isJsonRecord(entry) &&
      entry["kind"] === "min_quantity" &&
      typeof entry["value"] === "number"
    ) {
      return { kind: "min_quantity", value: entry["value"] };
    }
    throw unreadable("condition inconnue");
  });
}

function pauseOf(row: PromotionRow, unreadable: Unreadable): PromotionState["paused"] {
  if (row.pausedAt === null && row.pausedBy === null) {
    return null;
  }
  if (row.pausedAt === null || row.pausedBy === null) {
    throw unreadable("pause à moitié écrite");
  }
  return { at: row.pausedAt, by: row.pausedBy };
}

function archiveOf(row: PromotionRow, unreadable: Unreadable): PromotionState["archived"] {
  const { archivedAt, archivedBy, archiveReason } = row;
  if (archivedAt === null && archivedBy === null && archiveReason === null) {
    return null;
  }
  if (archivedAt === null || archivedBy === null || archiveReason === null) {
    throw unreadable("archivage à moitié écrit");
  }
  return { at: archivedAt, by: archivedBy, reason: archiveReason };
}

function originOf(value: unknown, unreadable: Unreadable): PromotionOrigin | null {
  if (value === null) {
    return null;
  }
  if (!isJsonRecord(value)) {
    throw unreadable("origine illisible");
  }
  if (value["kind"] === "price_rule" && typeof value["ruleId"] === "string") {
    return {
      kind: "price_rule",
      ruleId: value["ruleId"],
      ...(floorMemoOf(value["floor"]) ?? {}),
      ...(value["detached"] === undefined ? {} : { detached: value["detached"] }),
    };
  }
  const { siteId, clientele } = value;
  if (
    value["kind"] === "pickup_discount" &&
    typeof siteId === "string" &&
    typeof clientele === "string"
  ) {
    return { kind: "pickup_discount", siteId, clientele };
  }
  throw unreadable("origine inconnue");
}

function floorMemoOf(value: unknown): { readonly floor: { mode: string; value: number } } | null {
  if (
    isJsonRecord(value) &&
    typeof value["mode"] === "string" &&
    typeof value["value"] === "number"
  ) {
    return { floor: { mode: value["mode"], value: value["value"] } };
  }
  return null;
}
