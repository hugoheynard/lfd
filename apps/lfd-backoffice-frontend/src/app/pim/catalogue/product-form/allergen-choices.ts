import type { FoldSelectItem } from 'fold-ng';

import type { AllergenEntry } from '../../data/models';

/**
 * **Mettre le référentiel en cases, en listes et en options** — rien d'autre.
 *
 * Des fonctions pures, hors du magasin : ce sont des règles de PRÉSENTATION du
 * registre INCO (qui groupe vraiment, quel libellé fait foi), et elles se
 * testent sans monter un formulaire. Le magasin n'en garde que des `computed`
 * d'une ligne.
 */

/** Une catégorie d'étiquette et ce qu'elle rassemble. */
export interface AllergenBucket {
  readonly incoLabel: string;
  readonly entries: readonly AllergenEntry[];
}

/** Un choix à cocher : un code, et le libellé qui fait foi. */
export interface AllergenChoice {
  readonly code: string;
  /** Le libellé d'ÉTIQUETTE — « Anhydride sulfureux et sulfites ». */
  readonly label: string;
}

/** Le libellé RÉGLEMENTAIRE d'une substance seule ; sinon son nom granulaire. */
function labelOf(entry: AllergenEntry): string {
  return entry.incoLabel ?? entry.label;
}

/** Le référentiel rangé par catégorie d'étiquette, dans l'ordre du registre. */
export function bucketsOf(entries: readonly AllergenEntry[]): readonly AllergenBucket[] {
  const byLabel = new Map<string, AllergenEntry[]>();
  for (const entry of entries) {
    const key = entry.incoLabel ?? 'Hors obligation UE';
    const bucket = byLabel.get(key);
    if (bucket === undefined) {
      byLabel.set(key, [entry]);
    } else {
      bucket.push(entry);
    }
  }
  return [...byLabel.entries()].map(([incoLabel, group]) => ({ incoLabel, entries: group }));
}

/**
 * Les catégories qui groupent VRAIMENT — le gluten et ses céréales, les fruits
 * à coque et leurs fruits. Il n'y en a que deux.
 */
export function groupsOf(buckets: readonly AllergenBucket[]): readonly AllergenBucket[] {
  return buckets.filter((bucket) => bucket.entries.length > 1);
}

/**
 * Les autres, à plat.
 *
 * Une boîte encadrée intitulée « Lait » contenant une seule case « Lait » disait
 * deux fois la même chose, douze fois de suite : l'écran prenait la place de la
 * déclaration entière pour du chrome. C'est le libellé RÉGLEMENTAIRE qu'on
 * garde, pas le granulaire — « Anhydride sulfureux et sulfites » est ce qui doit
 * figurer sur l'étiquette, « Sulfites » n'est que notre abrégé.
 */
export function singlesOf(buckets: readonly AllergenBucket[]): readonly AllergenChoice[] {
  return buckets
    .filter((bucket) => bucket.entries.length === 1)
    .flatMap((bucket) =>
      bucket.entries.map((entry) => ({ code: entry.code, label: labelOf(entry) })),
    );
}

/**
 * Ce qu'on peut déclarer en **trace**, prêt pour `fold-multiselect`.
 *
 * Deux règles, et aucune n'est cosmétique :
 *
 * - le référentiel MOINS ce qui est déjà déclaré présent — un allergène présent
 *   n'est pas une éventualité, et le serveur refuse le chevauchement
 *   (`OverlappingAllergensError`). Ne pas le proposer vaut mieux que le refuser
 *   après coup ;
 * - le même regroupement que les cases. Sans ça, sept entrées du référentiel
 *   s'appelleraient toutes « Céréales contenant du gluten » dans la même liste.
 */
export function traceOptionsOf(
  buckets: readonly AllergenBucket[],
  present: ReadonlySet<string>,
): readonly FoldSelectItem<string>[] {
  return buckets.flatMap<FoldSelectItem<string>>((bucket) => {
    const grouped = bucket.entries.length > 1;
    const options = bucket.entries
      .filter((entry) => !present.has(entry.code))
      .map((entry) => ({ value: entry.code, label: grouped ? entry.label : labelOf(entry) }));
    if (options.length === 0) {
      return [];
    }
    return grouped ? [{ label: bucket.incoLabel, options }] : options;
  });
}

/**
 * Les allergènes cités par la composition et **absents de la déclaration en
 * cours** — la proposition, pas une vérification.
 *
 * Elle se calcule sur l'état à l'écran, et non sur ce qui est enregistré :
 * cocher une case doit faire disparaître la ligne tout de suite, sinon l'encart
 * reproche encore ce qu'on vient de corriger.
 *
 * Un code que le référentiel du catalogue courant ne connaît pas est ignoré : la
 * portée « UE » n'expose pas tout, et proposer un code sans libellé afficherait
 * `en:e220` à un opérateur.
 */
export function citedNotDeclaredIn(
  cited: readonly string[],
  declared: ReadonlySet<string>,
  entries: readonly AllergenEntry[],
): readonly AllergenChoice[] {
  const byCode = new Map(entries.map((entry) => [entry.code, entry]));
  return cited
    .filter((code) => !declared.has(code))
    .flatMap((code) => {
      const entry = byCode.get(code);
      return entry === undefined ? [] : [{ code, label: labelOf(entry) }];
    });
}
