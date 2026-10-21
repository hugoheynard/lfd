import type { GeneralOrderCutoffView, OrderTimeLimitView } from '@lfd/pim-contracts';

/**
 * Ce que la règle vise, en clair : le nom du produit.
 *
 * Depuis le 2026-10-21 (décision de Hugo), une limite ne se pose plus que sur
 * un produit. Le nom vient du serveur ; `null` veut dire que la cible n'a pas
 * été retrouvée, et l'on montre alors l'identifiant plutôt que rien — une
 * règle qui s'applique sans qu'on sache à quoi doit se voir.
 */
export function scopeLabel(rule: OrderTimeLimitView): string {
  return rule.scopeLabel ?? rule.scope.id ?? '';
}

/**
 * Le délai en une phrase — « La veille », « Le jour même », « 3 jours avant ».
 *
 * Une phrase plutôt qu'un `J−1` : c'est ce qu'on dira au téléphone, et un
 * nombre de jours nu se lit à l'envers une fois sur deux.
 */
export function daysPhrase(daysBefore: number): string {
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

/** Le rattrapage en clair. `0` se dit « Aucun » : c'est une décision. */
export function gracePhrase(graceMinutes: number): string {
  if (graceMinutes === 0) {
    return 'Aucun';
  }
  return graceMinutes % 60 === 0 ? `${graceMinutes / 60} h` : `${graceMinutes} min`;
}

/** La limite d'un produit en une ligne : « La veille, 18:00 ». */
export function limitPhrase(rule: OrderTimeLimitView): string {
  if (rule.daysBefore === null || rule.time === null) {
    // Une ligne d'avant le 2026-10-21 qui n'aurait pas les deux : elle ne
    // refuse rien, et le dire vaut mieux qu'une moitié de phrase.
    return 'Incomplète — ne s’applique pas';
  }
  return `${daysPhrase(rule.daysBefore)}, ${rule.time}`;
}

/** Les produits par nom, pour une liste qu'on parcourt des yeux. */
export function byName(a: OrderTimeLimitView, b: OrderTimeLimitView): number {
  return scopeLabel(a).localeCompare(scopeLabel(b), 'fr');
}

/**
 * La règle générale du commerce, en une phrase pour l'en-tête de la page.
 *
 * « Toute la production : la veille à 18:00, rattrapage aucun ». `null` quand
 * le commerce n'en a pas.
 */
export function generalCutoffPhrase(general: GeneralOrderCutoffView): string | null {
  const rule = general.rule;
  if (rule === null) {
    return null;
  }
  return `${daysPhrase(rule.daysBefore)} à ${rule.time}, rattrapage ${gracePhrase(rule.graceMinutes).toLowerCase()}`;
}
