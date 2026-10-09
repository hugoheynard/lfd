import type { FeatureKey, FeatureLevel } from '@lfd/contracts';

/**
 * **Le mot de chaque niveau d'accès, par fonctionnalité** — lu par l'écran
 * d'accès aux fonctionnalités (`admin/feature-access/`) et par le journal
 * (`shared/journal/phrases/accounts-phrases.ts`), qui raconte les dérogations.
 * Il vivait sous `admin/`, et le journal l'y importait : `shared/` ne dépend
 * pas d'`admin/` (déplacé au lot D du plan des phrases, 2026-09-19).
 *
 * Le catalogue du contrat ne porte pas de libellé par niveau, seulement les
 * valeurs (`closed`, `open`) — vérifié le 2026-09-14. Le mot montré
 * vit donc ici, et le TYPE le lie au catalogue : un niveau ajouté au contrat
 * sans son libellé ne compile pas.
 *
 * Import de TYPE seulement : la valeur `FEATURE_CATALOGUE` tirerait zod et tous
 * les schémas dans le bundle (cf. `PermissionsStore.can`).
 */
const LEVEL_LABELS: { readonly [Key in FeatureKey]: Readonly<Record<FeatureLevel<Key>, string>> } =
  {
    customerMandate: { closed: 'Fermé', open: 'Ouvert' },
  };

/**
 * **Les mots des clés retirées le 2026-10-09** (`shop`, `orders`, `invoices`,
 * `desktopMenu`, `publicDelivery`), pour le JOURNAL seulement.
 *
 * Le catalogue ne les connaît plus et l'écran d'accès ne les peint plus ; mais
 * les faits déjà écrits les nomment, et un journal qui passerait de « Fermée »
 * à `closed` du jour au lendemain réécrirait l'histoire dans une autre langue.
 * Hors du type `FeatureKey`, à dessein : rien d'autre ne doit les lire.
 */
const RETIRED_LEVEL_LABELS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  shop: { closed: 'Fermée', browse: 'Voir', order: 'Commander' },
  orders: { hidden: 'Masquées', visible: 'Visibles' },
  invoices: { hidden: 'Masquées', visible: 'Visibles' },
  desktopMenu: { hidden: 'Masqué', visible: 'Visible' },
  publicDelivery: { closed: 'Fermée', open: 'Ouverte' },
};

/**
 * Vrai si l'écran sait peindre cette clé. Une clé que le serveur renverrait
 * sans que ce front la connaisse (contrat en avance d'un déploiement) est
 * signalée, jamais interprétée.
 */
export function isKnownFeatureKey(key: string): key is FeatureKey {
  return Object.hasOwn(LEVEL_LABELS, key);
}

/** Le mot d'un niveau ; la valeur brute s'il n'en a pas, pour ne jamais montrer un vide. */
export function levelLabel(key: FeatureKey, level: string): string {
  const labels: Readonly<Record<string, string>> = LEVEL_LABELS[key];
  return Object.hasOwn(labels, level) ? (labels[level] ?? level) : level;
}

/**
 * Le mot d'un niveau tel qu'un fait du journal l'a écrit : une clé du
 * catalogue, une clé retirée, ou la valeur brute quand personne ne la connaît.
 */
export function journalLevelLabel(key: string, level: string): string {
  if (isKnownFeatureKey(key)) {
    return levelLabel(key, level);
  }
  const retired = RETIRED_LEVEL_LABELS[key];
  return retired !== undefined && Object.hasOwn(retired, level) ? (retired[level] ?? level) : level;
}
