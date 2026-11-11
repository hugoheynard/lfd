import type { PosedMercurialeView } from '@lfd/contracts';
import { gapBp } from '@lfd/money';

import { staffAuthor } from '../../shared/staff-author';
import { discountLabel, discountPhrase, type ArticleDiscount } from './general-discount';
import type { MercurialeRowView } from './mercuriale-rows';

/**
 * **Une mercuriale en CSV** — ce qu'on envoie au client, ou ce qu'on relit hors
 * de l'écran.
 *
 * Les mêmes trois choix que le relevé de facturation (`billing-csv.ts`), et ils
 * ne sont pas cosmétiques : le fichier s'ouvre dans un tableur français.
 *
 * - **séparateur `;`** — Excel en locale française ouvre un fichier `,` en une
 *   seule colonne, et il faut alors passer par l'assistant d'import ;
 * - **virgule décimale** — `1,73` et non `1.73`, sans quoi le tableur lit du
 *   texte et n'additionne rien ;
 * - **BOM UTF-8** en tête — sans lui, Excel lit les accents en latin-1 et
 *   « Août » devient « AoÃ»t ».
 *
 * 🔴 **Les prix sortent en euros à cinq décimales**, pas arrondis au centime.
 * Un prix unitaire négocié se pose avec ses décimales — « 2,13456 € » est une
 * saisie normale sur un grand compte — et arrondir ici ferait d'un export un
 * document qui ne correspond plus au tarif appliqué. C'est la différence entre
 * un prix unitaire et un montant encaissé, et ce fichier porte le premier.
 */

/** L'en-tête, dans l'ordre où la table se lit à l'écran. */
const HEADER = [
  'SKU',
  'Article',
  'Tarif catalogue pro',
  'Prix négocié',
  'Écart',
  'À partir de',
  'Origine',
] as const;

/** Un article dont la remise générale fait le prix, nommé pour l'export. */
export interface DiscountedCsvRow extends ArticleDiscount {
  readonly sku: string;
  readonly name: string;
  readonly canonicalMillicents: number;
}

/** Le préfixe qui dit à Excel que le fichier est en UTF-8. */
const BOM = '﻿';

/** `173270` → `1,73270`. Cinq décimales : c'est l'unité d'un prix unitaire. */
function euros(millicents: number): string {
  return (millicents / 100_000).toFixed(5).replace('.', ',');
}

/** `2500` → `25,0 %`. Le signe se dit en toutes lettres : « −25,0 % » est une baisse. */
function percent(bp: number): string {
  return `${bp > 0 ? '-' : '+'}${(Math.abs(bp) / 100).toFixed(1).replace('.', ',')} %`;
}

/**
 * Échappe une cellule : guillemets doublés, et entourée dès qu'elle porte un
 * séparateur, un guillemet ou un saut de ligne.
 *
 * Un nom d'article contient rarement un `;` — et « rarement » est exactement la
 * fréquence à laquelle un fichier se casse sans qu'on comprenne pourquoi.
 */
function cell(value: string): string {
  return /[";\n]/u.test(value) ? `"${value.replace(/"/gu, '""')}"` : value;
}

/**
 * Le fichier, prêt à télécharger.
 *
 * Les **deux premières lignes portent l'identité** de la mercuriale — son nom,
 * sa fenêtre, son auteur — avant l'en-tête des colonnes. Un tableau de prix sans
 * son entête est un tableau qu'on ne peut plus rattacher à personne dès qu'il a
 * quitté l'écran, et c'est précisément ce qu'un export sert à faire.
 *
 * Une **remise générale** en vigueur prend une ligne à elle, sous l'identité :
 * son taux de base, ses taux particuliers et ses exclusions, cibles nommées
 * par `names` (l'identifiant à défaut).
 *
 * Les lignes de prix portent **tout article dont la mercuriale change le
 * prix** : les prix fermes, puis les articles que la remise générale fait
 * (`discounted`), avec leur prix remisé — relevé par la limite s'il le faut.
 * La colonne « Origine » dit lequel des deux : le client lit un prix, et doit
 * savoir s'il est ferme ou s'il suivra le catalogue.
 */
export function mercurialeCsv(
  mercuriale: PosedMercurialeView,
  rows: readonly MercurialeRowView[],
  names: ReadonlyMap<string, string> = new Map(),
  discounted: readonly DiscountedCsvRow[] = [],
): string {
  const discount = mercuriale.generalDiscount ?? null;
  const window = `du ${day(mercuriale.validFrom)} au ${day(mercuriale.validTo)}`;
  const lines = [
    [
      cell(mercuriale.label),
      cell(window),
      cell(`établie par ${staffAuthor(mercuriale.createdBy, mercuriale.createdByName)}`),
    ].join(';'),
    ...(discount === null ? [] : [cell(`Remise générale : ${discountPhrase(discount, names)}`)]),
    '',
    HEADER.join(';'),
    ...rows.map((row) =>
      [
        cell(row.sku),
        cell(row.productName),
        row.catalogMillicents === null ? '' : euros(row.catalogMillicents),
        euros(row.negotiatedMillicents),
        row.gapBp === null ? '' : percent(row.gapBp),
        row.minQuantity > 1 ? String(row.minQuantity) : '',
        'Prix ferme',
      ].join(';'),
    ),
    ...discounted.map((row) =>
      [
        cell(row.sku),
        cell(row.name),
        euros(row.canonicalMillicents),
        euros(row.finalMillicents),
        discountGap(row),
        '',
        cell(
          `Remise générale ${discountLabel(row.bp)}${row.floored ? ', relevé à la limite' : ''}`,
        ),
      ].join(';'),
    ),
  ];
  return BOM + lines.join('\r\n');
}

/** L'écart d'un article remisé, par l'arithmétique de la colonne des prix fermes. */
function discountGap(row: DiscountedCsvRow): string {
  const gap = gapBp(row.canonicalMillicents, row.finalMillicents);
  return gap === null ? '' : percent(gap);
}

/** `2026-01-01T…` → `01/01/2026`, ou « sans terme » quand la fenêtre est ouverte. */
function day(iso: string | null): string {
  if (iso === null) {
    return 'sans terme';
  }
  const date = new Date(iso);
  const d = `${date.getDate()}`.padStart(2, '0');
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  return `${d}/${m}/${date.getFullYear()}`;
}

/**
 * Le nom du fichier. Le libellé y entre **assaini** : il est libre, il finit
 * dans un système de fichiers, et un `/` y coupe un chemin.
 */
export function mercurialeFileName(mercuriale: PosedMercurialeView): string {
  const slug = mercuriale.label
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .replace(/[^a-zA-Z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '')
    .toLowerCase();
  return `mercuriale-${slug === '' ? 'sans-nom' : slug}.csv`;
}
