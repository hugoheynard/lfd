import {
  SEVERAL_AUDIENCES,
  type PromotionLifecycleState,
  type PromotionScopeRuleView,
  type PromotionView,
} from "@lfd/contracts";

import type { PromotionCatalogue } from "../../domain/ports/promotion-catalogue.reader.js";
import { describePromotion } from "../../domain/promotion-act.js";
import { audienceCompanyIdOf, type PromotionAudience } from "../../domain/promotion-audience.js";
import { effectValueOf } from "../../domain/promotion-effect.js";
import type { PromotionScopeRule } from "../../domain/promotion-scope.js";
import type { Promotion } from "../../domain/promotion.js";

/**
 * **L'état lu à l'instant de la question** — l'archivage et la pause
 * d'abord, la fenêtre ensuite. Une promotion fermée sans être archivée est
 * `ended` : elle garde sa place dans le refus de chevauchement tant qu'on ne
 * l'archive pas, mais n'agit plus.
 */
export function lifecycleStateOf(promotion: Promotion, now: Date): PromotionLifecycleState {
  const state = promotion.toPersistence();
  if (state.archived !== null) {
    return "archived";
  }
  if (state.paused !== null) {
    return "paused";
  }
  if (state.validFrom.getTime() > now.getTime()) {
    return "scheduled";
  }
  return state.validTo !== null && state.validTo.getTime() <= now.getTime() ? "ended" : "active";
}

/** L'agrégat, en vue d'écran ; les cibles de portée nommées par le catalogue servi. */
export function promotionViewOf(
  promotion: Promotion,
  now: Date,
  catalogue: PromotionCatalogue,
): PromotionView {
  const state = promotion.toPersistence();
  return {
    id: state.id,
    internalName: state.internalName,
    label: state.label,
    reason: state.reason,
    state: lifecycleStateOf(promotion, now),
    applicationPoint: promotion.applicationPoint,
    effect: { kind: state.effect.kind, value: effectValueOf(state.effect) },
    ownFloor: state.ownFloor,
    stacksOverMercuriale: state.stacksOverMercuriale,
    cumulative: state.cumulative,
    validFrom: state.validFrom.toISOString(),
    validTo: state.validTo?.toISOString() ?? null,
    audienceLabels: state.audienceLabels,
    audiences: state.audiences.targets.map((target) => ({
      kind: target.kind,
      companyId: audienceCompanyIdOf(target),
    })),
    audience: projectionOf(state.audiences.targets),
    fulfillment: state.fulfillment,
    scope: {
      mode: state.scope.mode,
      rules: state.scope.rules.map((rule) => ruleViewOf(rule, catalogue)),
    },
    conditions: state.conditions,
    summary: describePromotion(state),
    paused:
      state.paused === null ? null : { at: state.paused.at.toISOString(), by: state.paused.by },
    archived:
      state.archived === null
        ? null
        : {
            at: state.archived.at.toISOString(),
            by: state.archived.by,
            reason: state.archived.reason,
          },
    legacySource: state.legacySource,
    createdAt: state.createdAt.toISOString(),
  };
}

function ruleViewOf(
  rule: PromotionScopeRule,
  catalogue: PromotionCatalogue,
): PromotionScopeRuleView {
  return {
    target: rule.target,
    targetId: rule.targetId,
    eligible: rule.eligible,
    name: nameOf(rule, catalogue),
  };
}

function nameOf(rule: PromotionScopeRule, catalogue: PromotionCatalogue): string | null {
  switch (rule.target) {
    case "category":
      return catalogue.categoryNames.get(rule.targetId) ?? null;
    case "product":
      return catalogue.productNames.get(rule.targetId) ?? null;
    case "variant":
      return catalogue.articles.find((article) => article.sku === rule.targetId)?.name ?? null;
  }
}

/** La projection d'avant L8b : la cible unique, ou `several` (§ 15.9). */
function projectionOf(targets: readonly PromotionAudience[]): PromotionView["audience"] {
  const [only] = targets;
  return targets.length === 1 && only !== undefined
    ? { kind: only.kind, companyId: audienceCompanyIdOf(only) }
    : { kind: SEVERAL_AUDIENCES, companyId: null };
}
