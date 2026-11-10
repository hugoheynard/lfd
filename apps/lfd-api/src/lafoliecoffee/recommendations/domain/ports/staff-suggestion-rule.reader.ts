import type { StaffSuggestionRuleSnapshot } from "../entities/staff-suggestion-rule.js";

/**
 * Port de **lecture** des suggestions décidées — distinct du dépôt (ISP) :
 * lister n'a pas à pouvoir écrire. Il rend des instantanés, jamais des
 * agrégats : une lecture ne mute rien.
 */
export abstract class StaffSuggestionRuleReader {
  /** Toutes, archivées comprises, la plus récemment créée d'abord. */
  abstract list(): Promise<readonly StaffSuggestionRuleSnapshot[]>;

  /** Celles qui ne sont pas archivées — la matière des règles applicables. */
  abstract listLive(): Promise<readonly StaffSuggestionRuleSnapshot[]>;
}
