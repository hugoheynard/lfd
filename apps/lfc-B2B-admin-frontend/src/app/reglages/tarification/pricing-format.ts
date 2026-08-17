import { formatEuros } from '@lfd/catalog-ui';
import { PRICE_STAGE_LABELS } from '@lfd/contracts';
import type {
  ElasticityComparison,
  ItemElasticityView,
  PriceRuleView,
  PricingItemView,
} from '@lfd/contracts';

/**
 * **La mise en forme des chiffres de l'écran Tarification.**
 *
 * Des fonctions pures, hors du composant : elles n'ont besoin ni de l'état de la
 * page ni d'Angular, et chacune porte une décision d'affichage qui mérite d'être
 * éprouvée seule. Un ratio infini, un écart nul, un objectif sans référence :
 * trois cas où la bonne réponse est de **ne rien afficher** plutôt qu'un
 * symbole que personne ne saurait lire.
 */

/**
 * De combien le prix a bougé, en pourcentage du tarif d'entrée.
 *
 * `null` quand rien n'a bougé : un « 0 % » sur chaque ligne inchangée serait du
 * bruit là où l'absence de puce dit déjà tout.
 */
export function deltaLabel(item: PricingItemView): string | null {
  if (item.canonicalCents <= 0 || item.finalCents === item.canonicalCents) {
    return null;
  }
  const ratio = (item.finalCents - item.canonicalCents) / item.canonicalCents;
  return `${ratio < 0 ? '−' : '+'}${Math.abs(ratio * 100)
    .toFixed(1)
    .replace('.', ',')} %`;
}

/** Une baisse et une hausse ne se lisent pas pareil : la puce le dit. */
export function isDiscount(item: PricingItemView): boolean {
  return item.finalCents < item.canonicalCents;
}

/**
 * Le ratio iso-chiffre, en clair : « ×1,25 ».
 *
 * `null` quand il n'a pas de valeur finie — un article offert n'atteint le
 * chiffre d'origine à aucun volume, et « ×∞ » n'aide personne.
 */
export function ratioLabel(elasticity: ItemElasticityView): string | null {
  const ratio = elasticity.isoRevenueRatioBp;
  return ratio === null ? null : `×${(ratio / 10_000).toFixed(2).replace('.', ',')}`;
}

/** Où en est le réalisé vis-à-vis de l'objectif, en pourcent entier. */
export function attainmentLabel(comparison: ElasticityComparison): string | null {
  return comparison.attainmentBp === null
    ? null
    : `${String(Math.round(comparison.attainmentBp / 100))} %`;
}

/** L'objectif est-il tenu ? Sert à colorer, jamais à cacher le chiffre. */
export function isOnTrack(comparison: ElasticityComparison): boolean {
  return comparison.attainmentBp !== null && comparison.attainmentBp >= 10_000;
}

/**
 * La marge négociable, dans les DEUX unités — le commercial choisit celle qu'il
 * annonce, et l'écran les met au même poids.
 */
export function roomEuros(maxDiscountCents: number): string {
  return formatEuros(maxDiscountCents);
}

export function roomPercent(maxDiscountBp: number): string {
  return `${(maxDiscountBp / 100).toFixed(1).replace('.', ',')} %`;
}

/**
 * **Ce qu'une règle fait, en une phrase.**
 *
 * Écrite une fois, lue à deux endroits : sur le nœud de la règle, et dans le
 * panneau qui demande pourquoi on l'archive. Deux formulations divergeraient, et
 * c'est précisément au moment d'archiver qu'on veut reconnaître ce qu'on avait
 * sous les yeux.
 *
 * L'étage y figure **en toutes lettres** : c'est ce qui permet à la couleur du
 * rail de renforcer l'information sans jamais la porter seule.
 */
export function ruleSentence(rule: PriceRuleView): string {
  const stage = PRICE_STAGE_LABELS[rule.stage];
  const tier = rule.minQuantity === null ? '' : ` dès ${String(rule.minQuantity)}`;
  return `${stage} ${ruleEffect(rule)}${tier}`;
}

function ruleEffect(rule: PriceRuleView): string {
  if (rule.effect.nature === 'replace') {
    return `à ${formatEuros(rule.effect.amountCents)}`;
  }
  const sign = rule.effect.direction === 'decrease' ? '−' : '+';
  return rule.effect.mode === 'percent'
    ? `${sign}${String(rule.effect.value / 100).replace('.', ',')} %`
    : `${sign}${formatEuros(rule.effect.value)}`;
}
