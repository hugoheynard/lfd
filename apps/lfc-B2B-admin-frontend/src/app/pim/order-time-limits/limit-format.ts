import {
  ORDER_TIME_LIMIT_SCOPE_LABELS,
  type OrderTimeLimitScopeType,
  type OrderTimeLimitView,
} from '@lfd/pim-contracts';

/** Ce qu'on écrit quand un rang ne se prononce pas — et hérite donc du dessus. */
export const INHERITED = 'Hérité';

/**
 * Ce que la règle vise, en clair : « Toute la production », ou le nom de la
 * cible.
 *
 * Le nom vient du serveur, qui l'a résolu ; `null` veut dire que la cible n'a
 * pas été retrouvée. On montre alors l'identifiant plutôt que rien — une règle
 * qui s'applique sans qu'on sache à quoi doit se voir, pas s'effacer avec sa
 * cible.
 */
export function scopeLabel(rule: OrderTimeLimitView): string {
  if (rule.scope.type === 'global') {
    return ORDER_TIME_LIMIT_SCOPE_LABELS.global;
  }
  return rule.scopeLabel ?? rule.scope.id ?? '';
}

/** Le rang, pour la pastille : « Famille », « Produit », « Déclinaison ». */
export function scopeKind(type: OrderTimeLimitScopeType): string {
  return ORDER_TIME_LIMIT_SCOPE_LABELS[type];
}

/**
 * Le délai en une phrase — « La veille », « Le jour même », « 3 jours avant ».
 *
 * Une phrase plutôt qu'un `J−1` : c'est ce qu'on dira au téléphone, et un
 * nombre de jours nu se lit à l'envers une fois sur deux.
 */
export function daysPhrase(daysBefore: number | null): string {
  if (daysBefore === null) {
    return INHERITED;
  }
  switch (daysBefore) {
    case 0:
      return 'Le jour même';
    case 1:
      return 'La veille';
    case 2:
      return "L'avant-veille";
    default:
      return `${daysBefore} jours avant`;
  }
}

/** L'heure, ou `Hérité`. */
export function timePhrase(time: string | null): string {
  return time ?? INHERITED;
}

/**
 * Le rattrapage en clair. `0` se dit **« Aucun »** et non `Hérité` : c'est une
 * décision — la limite est ferme — et la confondre avec un silence ferait croire
 * qu'un rang supérieur peut encore l'ouvrir.
 */
export function gracePhrase(graceMinutes: number | null): string {
  if (graceMinutes === null) {
    return INHERITED;
  }
  if (graceMinutes === 0) {
    return 'Aucun';
  }
  return graceMinutes % 60 === 0 ? `${graceMinutes / 60} h` : `${graceMinutes} min`;
}

/** Le rang, du plus général au plus précis — l'ordre où l'échelle se lit. */
const PRECISION: Readonly<Record<OrderTimeLimitScopeType, number>> = {
  global: 0,
  category: 1,
  product: 2,
  variant: 3,
};

/**
 * Trie les règles **du plus général au plus précis**, puis par nom.
 *
 * Cet ordre-là et pas l'inverse : l'écran raconte un héritage, et un héritage se
 * lit en partant de ce dont on hérite. Mettre le plus précis en tête ferait lire
 * les exceptions avant la règle.
 */
export function byPrecision(a: OrderTimeLimitView, b: OrderTimeLimitView): number {
  return (
    PRECISION[a.scope.type] - PRECISION[b.scope.type] ||
    scopeLabel(a).localeCompare(scopeLabel(b), 'fr')
  );
}

/**
 * D'où vient une valeur héritée, dit à la personne qui regarde.
 *
 * Nommer le rang plutôt qu'écrire « Hérité » : l'héritage se faisant **champ par
 * champ**, les trois valeurs d'une ligne peuvent venir de trois rangs
 * différents. Une mention unique aurait donc menti sur deux tiers de la ligne —
 * et « Hérité » tout court ne dit de toute façon pas ce qui s'applique.
 */
export function provenanceLabel(from: OrderTimeLimitScopeType): string {
  switch (from) {
    case 'variant':
      return 'cette déclinaison';
    case 'product':
      return 'la fiche';
    case 'category':
      return 'sa famille';
    case 'global':
      return 'le réglage général';
  }
}
