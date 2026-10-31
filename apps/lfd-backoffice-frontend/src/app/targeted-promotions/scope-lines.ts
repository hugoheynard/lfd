import type { PromotionScopeTargetValue } from '@lfd/contracts';

import type { ScopeArticle } from './catalogue-choices';
import type { PromotionDraft, PromotionScopeRuleDraft } from './promotion-draft';
import { exceptionTarget } from './scope-count';

export { covers, coveredCount, exceptionTarget, lineChoiceIds } from './scope-count';

/**
 * **La portée d'une promotion, rangée par famille** — la carte « Sur quels
 * articles ? » (`documentation/promotions/promotions.md`, § 2.9 ; demande de
 * Hugo du 2026-10-31). Pure : elle LIT les règles du brouillon et n'en
 * réécrit jamais que le sous-ensemble qu'un geste désigne. Une règle qu'aucune
 * ligne ne range reste dans le brouillon, et part telle quelle à
 * l'enregistrement.
 *
 * Une **ligne** est une famille réglée dans le sens du mode (exclue en
 * « tout sauf », incluse en « seulement ») ; ses **« Sauf »** sont les règles
 * produit ou déclinaison d'`eligible` inverse dont l'article est dans cette
 * famille. Le reste des règles produit/déclinaison est « à part ».
 */

/** Le sens d'une famille dans le mode : `only` inclut, `all_except` exclut. */
export function modeSense(mode: PromotionDraft['scopeMode']): boolean {
  return mode === 'only';
}

/** L'article qu'une règle produit ou déclinaison vise ; `undefined` sinon. */
function articleOfRule(
  rule: PromotionScopeRuleDraft,
  articles: readonly ScopeArticle[],
): ScopeArticle | undefined {
  if (rule.target === 'category') {
    return undefined;
  }
  return articles.find((entry) =>
    rule.target === 'variant' ? entry.sku === rule.targetId : entry.productId === rule.targetId,
  );
}

export interface FamilyLine {
  readonly familyId: string;
  /** Le sens de la règle de famille — celui du mode. */
  readonly eligible: boolean;
  /** Les produits ou déclinaisons de la famille réglés à l'inverse. */
  readonly exceptionIds: readonly string[];
}

export interface ScopeLayout {
  readonly lines: readonly FamilyLine[];
  /** Les règles de famille à contre-sens du mode : affichées en alerte, jamais réécrites. */
  readonly counterFamilies: readonly PromotionScopeRuleDraft[];
  /** Les règles produit/déclinaison qu'aucune ligne ne range. */
  readonly apart: readonly PromotionScopeRuleDraft[];
}

/** Les familles qui font ligne : réglées dans le sens du mode. */
function headIds(draft: PromotionDraft): readonly string[] {
  const sense = modeSense(draft.scopeMode);
  return draft.rules
    .filter((rule) => rule.target === 'category' && rule.eligible === sense)
    .map((rule) => rule.targetId);
}

/**
 * Une règle produit/déclinaison est-elle un « Sauf » de cette famille ? Son
 * article est dans la famille ou une de ses sous-familles, et aucune ligne
 * plus proche de lui ne le range — la famille la plus proche l'emporte,
 * comme au moteur.
 */
function ownedBy(
  rule: PromotionScopeRuleDraft,
  line: { readonly familyId: string; readonly eligible: boolean },
  draft: PromotionDraft,
  articles: readonly ScopeArticle[],
): boolean {
  if (rule.target !== exceptionTarget(draft) || rule.eligible === line.eligible) {
    return false;
  }
  const heads = new Set([...headIds(draft), line.familyId]);
  const path = articleOfRule(rule, articles)?.categoryPath ?? [];
  return path.find((familyId) => heads.has(familyId)) === line.familyId;
}

export function scopeLayout(draft: PromotionDraft, articles: readonly ScopeArticle[]): ScopeLayout {
  const sense = modeSense(draft.scopeMode);
  const families = draft.rules.filter((rule) => rule.target === 'category');
  const heads = families.filter((rule) => rule.eligible === sense);
  const lines = heads.map((rule) => ({
    familyId: rule.targetId,
    eligible: rule.eligible,
    exceptionIds: draft.rules
      .filter((candidate) =>
        ownedBy(candidate, { familyId: rule.targetId, eligible: sense }, draft, articles),
      )
      .map((candidate) => candidate.targetId),
  }));
  const owned = (rule: PromotionScopeRuleDraft) =>
    heads.some((head) =>
      ownedBy(rule, { familyId: head.targetId, eligible: sense }, draft, articles),
    );
  return {
    lines,
    counterFamilies: families.filter((rule) => rule.eligible !== sense),
    apart: draft.rules.filter((rule) => rule.target !== 'category' && !owned(rule)),
  };
}

/**
 * Remplace les règles que `replaced` désigne par `added`. Une cible ne se
 * règle qu'une fois : une règle ajoutée chasse celle qui visait déjà la même.
 */
function replaceRules(
  draft: PromotionDraft,
  replaced: (rule: PromotionScopeRuleDraft) => boolean,
  added: readonly PromotionScopeRuleDraft[],
): PromotionDraft {
  const key = (rule: PromotionScopeRuleDraft) => `${rule.target}:${rule.targetId}`;
  const taken = new Set(added.map(key));
  return {
    ...draft,
    rules: [...draft.rules.filter((rule) => !replaced(rule) && !taken.has(key(rule))), ...added],
  };
}

/** Ajoute une ligne : la famille, dans le sens du mode. */
export function withFamilyLine(draft: PromotionDraft, familyId: string): PromotionDraft {
  return replaceRules(draft, () => false, [
    { target: 'category', targetId: familyId, eligible: modeSense(draft.scopeMode) },
  ]);
}

/** Retire une ligne, et ses « Sauf » avec elle : sans la famille, ils ne disent plus rien. */
export function withoutFamilyLine(
  draft: PromotionDraft,
  familyId: string,
  articles: readonly ScopeArticle[],
): PromotionDraft {
  const line = { familyId, eligible: modeSense(draft.scopeMode) };
  return replaceRules(
    draft,
    (rule) =>
      (rule.target === 'category' &&
        rule.targetId === familyId &&
        rule.eligible === line.eligible) ||
      ownedBy(rule, line, draft, articles),
    [],
  );
}

/** Les « Sauf » d'une ligne, remplacés en bloc — chacun d'`eligible` inverse de la famille. */
export function withFamilyExceptions(
  draft: PromotionDraft,
  familyId: string,
  ids: readonly string[],
  articles: readonly ScopeArticle[],
): PromotionDraft {
  const line = { familyId, eligible: modeSense(draft.scopeMode) };
  const target = exceptionTarget(draft);
  return replaceRules(
    draft,
    (rule) => ownedBy(rule, line, draft, articles),
    ids.map((targetId) => ({ target, targetId, eligible: !line.eligible })),
  );
}

/** Les règles « à part » d'une cible et d'un sens, remplacées en bloc ; les lignes n'en perdent rien. */
export function withApartTargets(
  draft: PromotionDraft,
  target: PromotionScopeTargetValue,
  eligible: boolean,
  ids: readonly string[],
  articles: readonly ScopeArticle[],
): PromotionDraft {
  const apart = new Set(scopeLayout(draft, articles).apart);
  return replaceRules(
    draft,
    (rule) => apart.has(rule) && rule.target === target && rule.eligible === eligible,
    ids.map((targetId) => ({ target, targetId, eligible })),
  );
}

/** Retire une seule règle — la famille à contre-sens qu'une alerte désigne. */
export function withoutRule(draft: PromotionDraft, rule: PromotionScopeRuleDraft): PromotionDraft {
  return replaceRules(draft, (candidate) => candidate === rule, []);
}

/**
 * Le mode change le sens des familles ; les « Sauf » de chaque ligne
 * suivent, pour que « tout sauf Chocolaterie (hors Noir) » devienne
 * « seulement Chocolaterie (sauf Noir) ». Les règles à part ne bougent pas.
 */
export function withScopeModeLines(
  draft: PromotionDraft,
  mode: PromotionDraft['scopeMode'],
  articles: readonly ScopeArticle[],
): PromotionDraft {
  if (mode === draft.scopeMode) {
    return draft;
  }
  const apart = new Set(scopeLayout(draft, articles).apart);
  const flipped = new Set(
    draft.rules.filter((rule) => rule.target !== 'category' && !apart.has(rule)),
  );
  const sense = modeSense(mode);
  return {
    ...draft,
    scopeMode: mode,
    rules: draft.rules.map((rule) => {
      if (rule.target === 'category') {
        return { ...rule, eligible: sense };
      }
      return flipped.has(rule) ? { ...rule, eligible: !rule.eligible } : rule;
    }),
  };
}
