import { gapBp } from '@lfd/money';
import {
  POSED_MERCURIALE_STATUS_LABELS,
  type CompanyPricingCategoryView,
  type PosedMercurialeLineView,
  type PosedMercurialeView,
} from '@lfd/contracts';

/**
 * **Une ligne de la mercuriale telle qu'on la relit** — l'article, ce qu'il
 * coûte au catalogue, ce qu'on lui a accordé, et l'écart entre les deux.
 *
 * Le tarif pro ne vient PAS de la mercuriale : elle ne porte que le prix
 * accordé. Il est joint depuis le tableau des prix, donc lu **au présent** —
 * comme sur la grille d'un gabarit, et pour la même raison : un tarif catalogue
 * recopié au moment de la pose vieillirait en silence, et l'écart affiché
 * serait faux sans que rien ne le signale.
 *
 * ⚠️ Conséquence à assumer : sur une mercuriale ancienne, l'écart montré est
 * celui d'aujourd'hui, pas celui du jour où on l'a signée. C'est le bon choix —
 * la question qu'on pose en rouvrant un tarif négocié est « où en est-il par
 * rapport au catalogue maintenant ».
 */
export interface MercurialeRowView {
  readonly sku: string;
  readonly productName: string;
  /** Le tarif catalogue pro d'aujourd'hui. `null` = le catalogue ne le connaît plus. */
  readonly catalogMillicents: number | null;
  readonly negotiatedMillicents: number;
  /**
   * L'écart au tarif, en points de base. **Signé** : positif = moins cher que
   * le catalogue.
   *
   * `null` sans tarif catalogue — un article que le référentiel ne pousse plus.
   * Afficher « −100 % » serait pire que rien : ce n'est pas une remise, c'est
   * une absence.
   */
  readonly gapBp: number | null;
  /** Le seuil, quand il dépasse 1 : la mercuriale vient alors d'un gabarit. */
  readonly minQuantity: number;
  /** L'avenant qui a ouvert la ligne, `null` pour la grille. */
  readonly amendmentId: string | null;
  /**
   * Ce que la ligne a de propre quand elle ne suit pas la mercuriale — « Avenant
   * du 01/11/2026 · À venir », « Terminée le 15/11/2026 ». `null` : elle la suit.
   * Un même article peut paraître deux fois (prix arrêté, puis rouvert) : la
   * note dit laquelle vaut quand.
   */
  readonly lineNote: string | null;
}

/** La clé d'une ligne lue : un article peut paraître une fois par pièce (grille, avenants). */
export function mercurialeRowKey(row: MercurialeRowView): string {
  return `${row.sku}-${String(row.minQuantity)}-${row.amendmentId ?? 'grille'}`;
}

const DAY = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeZone: 'Europe/Paris' });

/** La note d'une ligne sur un article réservé depuis à un autre compte. */
export const RESERVED_ELSEWHERE_NOTE = 'Réservé à un autre compte';

/** La note d'une ligne datée à part (2026-10-29 : avenants et arrêts). */
export function lineNoteOf(line: PosedMercurialeLineView): string | null {
  const parts: string[] = [];
  if (line.amendmentId !== undefined && line.validFrom !== undefined) {
    parts.push(`Avenant du ${DAY.format(new Date(line.validFrom))}`);
  }
  if (line.validTo !== undefined && line.validTo !== null) {
    parts.push(`jusqu’au ${DAY.format(new Date(line.validTo))}`);
  }
  if (line.status !== undefined) {
    parts.push(POSED_MERCURIALE_STATUS_LABELS[line.status]);
  }
  // Réservé depuis à un autre compte (`plan-articles-sur-mesure.md`, Q1) : la
  // ligne reste, le client ne peut plus le commander — l'écran le dit.
  if (line.lockedReason === 'reserved_to_other_account') {
    parts.push(RESERVED_ELSEWHERE_NOTE);
  }
  return parts.length === 0 ? null : parts.join(' · ');
}

/**
 * L'écart au tarif catalogue, signé. Positif = le client paie moins cher.
 *
 * Réexporté de `@lfd/money` : cette fonction existait **à l'identique** dans
 * `template-grid.ts` — JSDoc compris — et en trois variantes ailleurs, dont deux
 * qui répondaient autre chose quand le tarif catalogue vaut zéro. Le réexport
 * garde le nom que ce dossier emploie sans garder la copie.
 */
export { gapBp };

/**
 * Les lignes d'une mercuriale, jointes au catalogue.
 *
 * L'ordre est celui de la mercuriale — du moins cher au plus cher, tel que le
 * serveur le rend. Le retrier par nom ferait perdre ce qu'on vient chercher :
 * ce qu'on a le plus lâché.
 */
export function mercurialeRows(
  mercuriale: PosedMercurialeView,
  categories: readonly CompanyPricingCategoryView[],
): readonly MercurialeRowView[] {
  const catalogue = new Map(
    categories.flatMap((category) =>
      category.items.map((item) => [item.sku, item.canonicalMillicents] as const),
    ),
  );
  return mercuriale.lines.map((line) => {
    const catalogMillicents = catalogue.get(line.sku) ?? null;
    return {
      sku: line.sku,
      productName: line.productName,
      catalogMillicents,
      negotiatedMillicents: line.unitPriceMillicents,
      gapBp: gapBp(catalogMillicents, line.unitPriceMillicents),
      minQuantity: line.minQuantity,
      amendmentId: line.amendmentId ?? null,
      lineNote: lineNoteOf(line),
    };
  });
}
