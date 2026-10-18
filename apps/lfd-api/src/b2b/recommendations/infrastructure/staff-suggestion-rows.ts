import type { StaffSuggestionRule as StaffSuggestionRuleRow } from "../../../platform/database/client/client.js";
import type {
  StaffSuggestionRuleRecord,
  StaffSuggestionRuleSnapshot,
} from "../domain/entities/staff-suggestion-rule.js";
import type {
  SuggestionConditions,
  SuggestionConditionsInput,
} from "../domain/value-objects/suggestion-conditions.js";

/**
 * Ligne ↔ règle. Les jours sont rangés en `DATE` : Prisma les rend à minuit
 * UTC, et c'est leur partie `AAAA-MM-JJ` qui est le jour — aucune conversion
 * de fuseau n'y entre.
 */

export function toRecord(row: StaffSuggestionRuleRow): StaffSuggestionRuleRecord {
  return {
    id: row.id,
    trigger: { kind: row.triggerKind, ref: row.triggerRef },
    suggestedSkus: row.suggestedSkus,
    placement: row.placement,
    audience: row.audience,
    startsOn: dayOf(row.startsOn),
    endsOn: dayOf(row.endsOn),
    phrase:
      row.phraseFr === null
        ? null
        : {
            fr: row.phraseFr,
            ...(row.phraseEn === null ? {} : { en: row.phraseEn }),
            ...(row.phraseIt === null ? {} : { it: row.phraseIt }),
          },
    priority: row.priority,
    conditions: conditionsOf(row),
    active: row.active,
    created: { by: row.createdBy, at: row.createdAt },
    lastWrite: { by: row.updatedBy, at: row.updatedAt },
    archivedAt: row.archivedAt,
  };
}

/** Les colonnes que l'état écrit — tout sauf l'id. */
export function ruleColumns(rule: StaffSuggestionRuleSnapshot) {
  return {
    triggerKind: rule.trigger.kind,
    triggerRef: rule.trigger.ref,
    suggestedSkus: [...rule.suggestedSkus],
    placement: rule.placement,
    audience: rule.audience,
    startsOn: dateOf(rule.period.startsOn),
    endsOn: dateOf(rule.period.endsOn),
    phraseFr: rule.phrase?.fr ?? null,
    phraseEn: rule.phrase?.en ?? null,
    phraseIt: rule.phrase?.it ?? null,
    priority: rule.priority,
    ...conditionColumns(rule.conditions),
    active: rule.active,
    createdAt: rule.created.at,
    createdBy: rule.created.by,
    updatedAt: rule.lastWrite.at,
    updatedBy: rule.lastWrite.by,
    archivedAt: rule.archivedAt,
  };
}

/** Une liste vide en base = la condition n'est pas posée. */
function conditionsOf(row: StaffSuggestionRuleRow): SuggestionConditionsInput {
  return {
    weekdays: row.conditionWeekdays.length === 0 ? null : row.conditionWeekdays,
    hours:
      row.conditionHoursFrom === null || row.conditionHoursTo === null
        ? null
        : { from: row.conditionHoursFrom, to: row.conditionHoursTo },
    minCartTotalCents: row.conditionMinCartTotalCents,
    cartWithoutFamilyId: row.conditionCartWithoutFamilyId,
    pickupAddressIds:
      row.conditionPickupAddressIds.length === 0 ? null : row.conditionPickupAddressIds,
  };
}

function conditionColumns(conditions: SuggestionConditions) {
  return {
    conditionWeekdays: [...(conditions.weekdays ?? [])],
    conditionHoursFrom: conditions.hours?.from ?? null,
    conditionHoursTo: conditions.hours?.to ?? null,
    conditionMinCartTotalCents: conditions.minCartTotalCents,
    conditionCartWithoutFamilyId: conditions.cartWithoutFamilyId,
    conditionPickupAddressIds: [...(conditions.pickupAddressIds ?? [])],
  };
}

function dayOf(date: Date): string {
  return date.toISOString().slice(0, "AAAA-MM-JJ".length);
}

/**
 * Un jour vers la colonne `DATE` : Prisma attend un `Date`, dont seule la
 * date compte. Une date ISO nue se lit à minuit UTC, et se relit donc au même
 * jour (comme les jours de retrait de `operation-rows.ts`).
 */
function dateOf(day: string): Date {
  return new Date(day);
}
