/**
 * **Le suivi d'accessibilité de la boutique**, tel que le public le lit — sous
 * la déclaration d'accessibilité (Hugo, 2026-10-26).
 *
 * Il est produit par `pnpm rgaa:digest` depuis la grille d'audit
 * (`documentation/accessibilite/grille-audit-rgaa.json`), embarqué par l'API et
 * servi tel quel par `GET /content/accessibility-follow-up`. Types seulement :
 * la boutique l'importe sans tirer zod au démarrage.
 *
 * Deux modes, un seul emplacement : tant que l'audit n'est pas fait,
 * `conformity` vaut `null` et la boutique ne montre que les corrections ; une
 * fois la grille tranchée et l'audit daté, il porte les comptes (le taux s'en
 * déduit, aucun flottant ne voyage).
 */

/** Où en est une correction. */
export type AccessibilityCorrectionStatus = "done" | "in_progress" | "planned";

/** Une ligne du suivi, dans les trois langues de la boutique. */
export interface AccessibilityCorrectionView {
  /** Le numéro de la thématique RGAA (1 à 13) ; `null` : transversale (l'audit lui-même). */
  readonly theme: number | null;
  /** `AAAA-MM-JJ` : livrée (`done`), commencée (`in_progress`) ; `null` si rien n'est daté. */
  readonly date: string | null;
  readonly status: AccessibilityCorrectionStatus;
  readonly label: { readonly fr: string; readonly en: string; readonly it: string };
}

/** L'audit complet : son mois prévu (`AAAA-MM`) et son jour de fin (`AAAA-MM-JJ`), `null` tant qu'ils ne sont pas décidés. */
export interface AccessibilityAuditView {
  readonly plannedFor: string | null;
  readonly completedOn: string | null;
}

/** Les comptes RGAA d'une thématique, ou de l'ensemble. Taux = C / (C + NC). */
export interface AccessibilityConformityCounts {
  readonly compliant: number;
  readonly nonCompliant: number;
  readonly notApplicable: number;
}

/** Les comptes d'une thématique. */
export interface AccessibilityThemeConformity extends AccessibilityConformityCounts {
  readonly theme: number;
}

/** Le second mode : les comptes, une fois l'audit fini. */
export interface AccessibilityConformityView extends AccessibilityConformityCounts {
  readonly byTheme: readonly AccessibilityThemeConformity[];
}

/** Ce que sert `GET /content/accessibility-follow-up`. */
export interface AccessibilityFollowUpView {
  readonly corrections: readonly AccessibilityCorrectionView[];
  readonly audit: AccessibilityAuditView;
  /** `null` tant que l'audit n'est pas fait — aucun taux n'est publié avant (Hugo, 2026-10-26). */
  readonly conformity: AccessibilityConformityView | null;
}
