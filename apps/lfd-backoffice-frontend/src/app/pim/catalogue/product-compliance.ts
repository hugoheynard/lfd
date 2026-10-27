import type { FoldBadgeVariant } from 'fold-ng';
import type {
  ComplianceSeverity,
  ProductComplianceFinding,
  ProductComplianceWarningView,
} from '@lfd/pim-contracts';

import type { ProductStatus } from '../data/models';

/**
 * **Dire les constats de conformité d'une fiche** — le jugement UNIQUE du
 * serveur (`GET /pim/catalogue/products/compliance-warnings`), mis en mots
 * pour le staff. Rien n'est jugé ici : le front lit, il ne recalcule pas.
 */

/** Le badge d'une fiche qui porte des constats. */
export interface ComplianceBadge {
  readonly label: string;
  readonly variant: FoldBadgeVariant;
}

/** Les constats, rangés par fiche. Une fiche absente n'en porte aucun. */
export function findingsByProduct(
  views: readonly ProductComplianceWarningView[],
): ReadonlyMap<string, readonly ProductComplianceFinding[]> {
  return new Map(views.map((view) => [view.productId, view.warnings]));
}

/** Le pire constat : un seul bloquant suffit à bloquer. `null` = aucun constat. */
export function worstSeverity(
  findings: readonly ProductComplianceFinding[] | undefined,
): ComplianceSeverity | null {
  if (findings === undefined || findings.length === 0) {
    return null;
  }
  return findings.some((finding) => finding.severity === 'blocking') ? 'blocking' : 'warning';
}

/**
 * Ce que la liste dit d'une fiche jugée. Un bloquant ne veut pas dire la même
 * chose selon le statut : sur un brouillon, il empêche l'activation
 * (« Bloquant ») ; sur une fiche PUBLIÉE, il n'empêche plus rien — elle est déjà
 * en vente, et il faut la corriger (« Non conforme », Hugo le 2026-10-27).
 */
export type ComplianceState = 'non_compliant_live' | 'blocking' | 'warning';

export function complianceStateOf(
  status: ProductStatus,
  findings: readonly ProductComplianceFinding[] | undefined,
): ComplianceState | null {
  const severity = worstSeverity(findings);
  if (severity === 'blocking' && status === 'published') {
    return 'non_compliant_live';
  }
  return severity;
}

const BADGES: Readonly<Record<ComplianceState, ComplianceBadge>> = {
  non_compliant_live: { label: 'Non conforme', variant: 'alert' },
  blocking: { label: 'Bloquant', variant: 'alert' },
  warning: { label: 'À vérifier', variant: 'warning' },
};

export function complianceBadge(state: ComplianceState): ComplianceBadge {
  return BADGES[state];
}

/** Ce qui précède le détail d'une fiche en vente non conforme. */
const LIVE_PREFIX = 'En vente — à corriger : ';

/** Les contextes de vente tels que l'écran les nomme. Les clés sont celles du référentiel. */
const VAT_CONTEXT_LABELS: Readonly<Record<string, string>> = {
  takeaway: 'à emporter',
  eatIn: 'sur place',
  b2b: 'B2B',
};
const VAT_GAP_PREFIX = 'vat:';

/**
 * Ce qu'un manque se dit — codes de `variant-completeness.ts` (référentiel).
 * LA table du back-office : le catalogue publié (`published-catalogue.ts`) la
 * réutilise, une seule orthographe par code. Des noms, lus après « manque : ».
 */
const GAP_LABELS: Readonly<Record<string, string>> = {
  price: 'prix',
  allergens: 'allergènes',
  pro_price: 'prix pro',
  pro_price_rule: 'rapport pro',
  allergen_contradiction: 'déclaration d’allergènes cohérente avec la composition',
};

export function gapLabel(gap: string): string {
  if (gap.startsWith(VAT_GAP_PREFIX)) {
    const context = gap.slice(VAT_GAP_PREFIX.length);
    return `taux de TVA ${VAT_CONTEXT_LABELS[context] ?? `« ${context} »`}`;
  }
  return GAP_LABELS[gap] ?? gap;
}

/**
 * Un constat, en une phrase qui dit le cas et le geste de sortie.
 * `allergenLabel` rend le libellé français d'un code (le code lui-même faute de mieux).
 */
export function findingText(
  finding: ProductComplianceFinding,
  allergenLabel: (code: string) => string,
): string {
  switch (finding.code) {
    case 'all_variants_discontinued':
      return 'Toutes les déclinaisons sont arrêtées : rien ne se vendrait — rouvrez-en une.';
    case 'variant_incomplete':
      return `Déclinaison ${finding.sku} — manque : ${finding.missing.map(gapLabel).join(', ')}.`;
    case 'allergens_contradict_none':
      return (
        `La composition contredit la déclaration d'allergènes (SKU ${finding.sku}) : ` +
        `${finding.allergenCodes.map(allergenLabel).join(', ')} — reprenez-la dans la fiche ` +
        `réglementaire, ou retirez l'ingrédient en cause.`
      );
    case 'allergens_cited_not_declared':
      return (
        `La composition cite des allergènes absents de la déclaration (SKU ${finding.sku}) : ` +
        `${finding.allergenCodes.map(allergenLabel).join(', ')} — déclarez-les dans la fiche ` +
        `réglementaire, ou retirez l'ingrédient en cause.`
      );
  }
}

/** Tous les constats d'une fiche, bloquants d'abord ; préfixés quand elle est en vente. */
export function findingsText(
  findings: readonly ProductComplianceFinding[],
  allergenLabel: (code: string) => string,
  state: ComplianceState | null = null,
): string {
  const prefix = state === 'non_compliant_live' ? LIVE_PREFIX : '';
  return (
    prefix +
    [...findings]
      .sort((a, b) => Number(b.severity === 'blocking') - Number(a.severity === 'blocking'))
      .map((finding) => findingText(finding, allergenLabel))
      .join(' ')
  );
}
