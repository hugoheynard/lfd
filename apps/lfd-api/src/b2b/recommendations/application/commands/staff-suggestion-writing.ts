import type {
  StaffSuggestionRule,
  StaffSuggestionRuleSnapshot,
} from "../../domain/entities/staff-suggestion-rule.js";
import {
  SuggestionRuleNotFoundError,
  UnknownSuggestionCatalogueError,
} from "../../domain/errors/staff-suggestion-errors.js";
import type { AudienceSkuReader } from "../../domain/ports/audience-sku.reader.js";
import type { StaffSuggestionRuleRepository } from "../../domain/ports/staff-suggestion-rule.repository.js";
import type { SuggestionFamilyReader } from "../../domain/ports/suggestion-family.reader.js";
import { triggerSku } from "../../domain/value-objects/suggestion-trigger.js";

/**
 * Ce que les gestes d'écriture des suggestions partagent : charger ou
 * refuser, et confronter une règle au catalogue servi.
 */

/** @throws {SuggestionRuleNotFoundError} aucune règle ne porte cet id. */
export async function requireRule(
  rules: StaffSuggestionRuleRepository,
  id: string,
): Promise<StaffSuggestionRule> {
  const rule = await rules.load(id);
  if (rule === null) {
    throw new SuggestionRuleNotFoundError(id);
  }
  return rule;
}

/** Les deux lectures du catalogue qu'une saisie demande. */
export interface SuggestionCatalogue {
  readonly skus: AudienceSkuReader;
  readonly families: SuggestionFamilyReader;
}

/**
 * **Tout ce que nomme la règle existe au catalogue servi** — l'article qui
 * déclenche, ceux qu'elle montre, la famille. Un SKU mal tapé serait sinon
 * écrit sans bruit, et la suggestion ne paraîtrait jamais sans que personne
 * sache pourquoi. Jugé après l'agrégat : c'est lui qui a rogné les valeurs.
 *
 * @throws {UnknownSuggestionCatalogueError}
 */
export async function ensureInCatalogue(
  catalogue: SuggestionCatalogue,
  rule: StaffSuggestionRuleSnapshot,
): Promise<void> {
  const triggering = triggerSku(rule.trigger);
  const skus = [...(triggering === null ? [] : [triggering]), ...rule.suggestedSkus];
  const served = await catalogue.skus.servedAmong(skus);
  const unknownSkus = skus.filter((sku) => !served.has(sku));
  if (unknownSkus.length > 0) {
    throw new UnknownSuggestionCatalogueError("articles", unknownSkus);
  }
  if (rule.trigger.kind === "category_in_cart" && rule.trigger.ref !== null) {
    const known = await catalogue.families.knownAmong([rule.trigger.ref]);
    if (!known.has(rule.trigger.ref)) {
      throw new UnknownSuggestionCatalogueError("familles", [rule.trigger.ref]);
    }
  }
}
