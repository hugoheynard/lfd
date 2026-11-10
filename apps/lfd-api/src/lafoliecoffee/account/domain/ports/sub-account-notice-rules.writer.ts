import type { SubAccountNoticeRuleOverride } from "./sub-account-notice-rules.reader.js";

/**
 * **Écrire les dérogations du tableau des avis d'un principal** — port
 * d'écriture, distinct de sa lecture (ISP).
 *
 * Un réglage sans transition : aucun agrégat (CLAUDE.md §3.1, « où ne pas
 * mettre d'agrégat »). Revenir au défaut **efface** la dérogation : l'absence
 * de ligne est le défaut, et lui donner une écriture ferait deux façons de
 * dire la même chose.
 */
export abstract class SubAccountNoticeRulesWriter {
  /** Pose (ou remplace) la dérogation d'une cellule. `staffId` : l'id de fiche du staff. */
  abstract set(
    principalId: string,
    rule: SubAccountNoticeRuleOverride,
    staffId: string,
    at: Date,
  ): Promise<void>;

  /** Remet une cellule au défaut. Sans ligne, ne fait rien. */
  abstract clear(
    principalId: string,
    rule: Omit<SubAccountNoticeRuleOverride, "enabled">,
  ): Promise<void>;

  /** Remet tout le tableau du principal au défaut. */
  abstract clearAll(principalId: string): Promise<void>;
}
