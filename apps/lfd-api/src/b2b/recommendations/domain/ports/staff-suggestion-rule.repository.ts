import type { StaffSuggestionRule } from "../entities/staff-suggestion-rule.js";

/**
 * Port d'**écriture** des suggestions décidées — il prend et rend l'agrégat.
 * `add` crée, `save` réécrit l'état entier. Il voit les archivées : un id
 * archivé reste pris, et un geste sur elle doit être refusé par l'agrégat,
 * pas passer pour un 404.
 */
export abstract class StaffSuggestionRuleRepository {
  /** La règle, archivée comprise, ou `null`. */
  abstract load(id: string): Promise<StaffSuggestionRule | null>;

  abstract add(rule: StaffSuggestionRule): Promise<void>;

  abstract save(rule: StaffSuggestionRule): Promise<void>;
}
