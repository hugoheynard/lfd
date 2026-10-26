import type { AccessibilityFollowUpView } from "@lfd/contracts";

/**
 * Port de lecture du **suivi d'accessibilité** de la boutique — les
 * corrections et l'état de l'audit RGAA, publiés sous la déclaration
 * d'accessibilité (Hugo, 2026-10-26).
 *
 * Lecture seule : la source est la grille d'audit du dépôt, pas une table.
 * Rien ne s'y écrit depuis l'API ; on la change dans
 * `documentation/accessibilite/grille-audit-rgaa.json`, puis `pnpm rgaa:digest`.
 */
export abstract class AccessibilityFollowUpReader {
  abstract read(): AccessibilityFollowUpView;
}
