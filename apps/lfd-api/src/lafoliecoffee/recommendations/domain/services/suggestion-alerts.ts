import {
  addDays,
  STAFF_SUGGESTION_ALERT_HORIZON_DAYS,
  weekdayOfDate,
  type StaffSuggestionConditionAlert,
  type StaffSuggestionAlertWindow,
  type StaffSuggestionItemAlert,
  type StaffSuggestionReader,
  type StaffSuggestionRuleAlert,
} from "@lfd/contracts";

import type { StaffSuggestionRuleSnapshot } from "../entities/staff-suggestion-rule.js";

/** Pourquoi le catalogue servi ne rend pas un article à une clientèle. */
export type NotServedCause = "withdrawn" | "not_for_audience" | "hidden_for_audience";

/** Ce que le catalogue a dit des articles d'une règle, pour UNE de ses clientèles. */
export interface AudienceFacts {
  readonly audience: StaffSuggestionReader;
  /** Les SKU non servis à cette clientèle, et pourquoi. */
  readonly notServed: ReadonlyMap<string, NotServedCause>;
  /** Les SKU servis mais commandables aucun jour de la fenêtre. */
  readonly neverOrderable: ReadonlySet<string>;
}

/** La fenêtre regardée, et ses jours un par un. */
export interface AlertWindow extends StaffSuggestionAlertWindow {
  readonly days: readonly string[];
}

/**
 * **Les règles qu'on surveille** : non archivées, allumées, dont la période
 * n'est pas finie. Une règle finie, coupée ou archivée ne s'affiche plus en
 * boutique : la signaler accuserait d'un vide que personne ne verra.
 */
export function watchedRules(
  rules: readonly StaffSuggestionRuleSnapshot[],
  today: string,
): readonly StaffSuggestionRuleSnapshot[] {
  return rules.filter(
    (rule) => rule.archivedAt === null && rule.active && rule.period.endsOn >= today,
  );
}

/** Les clientèles qu'une règle atteint. */
export function readersOf(rule: StaffSuggestionRuleSnapshot): readonly StaffSuggestionReader[] {
  return rule.audience === "both" ? ["pro", "public"] : [rule.audience];
}

/**
 * **Les jours où chercher un jour commandable** : de la plus tardive de
 * (aujourd'hui, début) à la plus proche de (fin, aujourd'hui + 30). `null`
 * quand la période commence au-delà de l'horizon : on n'en dit rien.
 */
export function alertWindow(rule: StaffSuggestionRuleSnapshot, today: string): AlertWindow | null {
  const horizon = addDays(today, STAFF_SUGGESTION_ALERT_HORIZON_DAYS - 1);
  const from = rule.period.startsOn > today ? rule.period.startsOn : today;
  const capped = rule.period.endsOn > horizon;
  const to = capped ? horizon : rule.period.endsOn;
  if (from > to) {
    return null;
  }
  const days: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    days.push(day);
  }
  return { from, to, capped, days };
}

/** Ce que les conditions (RS8) disent d'une règle : leurs alertes, et si elles l'éteignent. */
export interface ConditionFindings {
  readonly alerts: readonly StaffSuggestionConditionAlert[];
  /** Une condition ne peut plus être vraie : la règle ne s'affichera plus. */
  readonly blocking: boolean;
}

export const NO_CONDITION_FINDINGS: ConditionFindings = { alerts: [], blocking: false };

/**
 * **Les conditions qui rendent une règle impossible** (RS8) : un point de
 * retrait choisi qui n'est plus ouvert (tous fermés : elle s'éteint), ou des
 * jours de la semaine dont aucun ne tombe dans la fenêtre regardée. Une
 * fenêtre absente ou plafonnée n'en dit rien sur les jours : plafonnée, elle
 * couvre plus d'une semaine.
 */
export function conditionFindings(
  rule: StaffSuggestionRuleSnapshot,
  openSites: ReadonlySet<string>,
  window: AlertWindow | null,
): ConditionFindings {
  const sites = rule.conditions.pickupAddressIds ?? [];
  const closed = sites.filter((id) => !openSites.has(id));
  const alerts: StaffSuggestionConditionAlert[] = closed.map((siteId) => ({
    reason: "site_closed",
    siteId,
  }));
  const weekdays = rule.conditions.weekdays;
  const noWeekdayLeft =
    weekdays !== null &&
    window !== null &&
    !window.capped &&
    !window.days.some((day) => weekdays.includes(weekdayOfDate(day)));
  if (noWeekdayLeft) {
    alerts.push({ reason: "no_weekday_left", siteId: null });
  }
  const allClosed = sites.length > 0 && closed.length === sites.length;
  return { alerts, blocking: allClosed || noWeekdayLeft };
}

/**
 * **L'alerte d'une règle**, ou `null` si elle est saine. Un article « passe »
 * s'il est servi ET commandable pour au moins une des clientèles de la règle ;
 * aucun ne passe, un déclencheur mort, ou une condition qui ne peut plus être
 * vraie : `empty`. Sinon, la moindre raison
 * suffit à `partial`. Un retrait vaut pour tous : une seule ligne, sans
 * clientèle.
 */
export function ruleAlert(
  rule: StaffSuggestionRuleSnapshot,
  triggerWithdrawn: boolean,
  facts: readonly AudienceFacts[],
  window: StaffSuggestionAlertWindow | null,
  conditions: ConditionFindings = NO_CONDITION_FINDINGS,
): StaffSuggestionRuleAlert | null {
  const items = rule.suggestedSkus.flatMap((sku) => itemAlerts(sku, facts));
  if (items.length === 0 && !triggerWithdrawn && conditions.alerts.length === 0) {
    return null;
  }
  const anyPasses = rule.suggestedSkus.some((sku) =>
    facts.some((fact) => !fact.notServed.has(sku) && !fact.neverOrderable.has(sku)),
  );
  return {
    ruleId: rule.id,
    severity: triggerWithdrawn || !anyPasses || conditions.blocking ? "empty" : "partial",
    triggerWithdrawn,
    items,
    conditions: conditions.alerts,
    window: window === null ? null : { from: window.from, to: window.to, capped: window.capped },
  };
}

function itemAlerts(sku: string, facts: readonly AudienceFacts[]): StaffSuggestionItemAlert[] {
  const perAudience = facts.flatMap((fact): StaffSuggestionItemAlert[] => {
    const cause = fact.notServed.get(sku);
    if (cause !== undefined) {
      return [{ sku, audience: fact.audience, reason: cause }];
    }
    return fact.neverOrderable.has(sku)
      ? [{ sku, audience: fact.audience, reason: "never_orderable" }]
      : [];
  });
  return perAudience.some((alert) => alert.reason === "withdrawn")
    ? [{ sku, audience: null, reason: "withdrawn" }]
    : perAudience;
}
