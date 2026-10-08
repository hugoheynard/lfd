import type { IssuedInvoiceKind, IssuedInvoiceLineView } from '@lfd/contracts';

/**
 * Les mises en forme propres à une **facture émise** (E6) — le reste
 * (euros, prix unitaire, taux, jour) est celui du dossier simulé
 * (`invoice-dossier-format.ts`), pour qu'une facture et sa simulation se
 * lisent avec les mêmes chiffres.
 */

const THOUSANDTHS = 1_000;
const BASIS_POINTS_PER_PERCENT = 100;

/** `invoice` → « Facture », `credit_note` → « Avoir ». */
export function kindLabel(kind: IssuedInvoiceKind): string {
  return kind === 'invoice' ? 'Facture' : 'Avoir';
}

/** `2026-09` → « septembre 2026 ». */
export function periodLabel(month: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${month}-01T00:00:00.000Z`));
}

/**
 * La quantité, en entiers jusqu'au bout : `2000` pièces-millièmes → « 2 »,
 * `1250` kg-millièmes → « 1,250 kg ». Une pièce reste entière (`H87`).
 */
export function quantityLabel(
  line: Pick<IssuedInvoiceLineView, 'quantityThousandths' | 'unitCode'>,
): string {
  const whole = Math.trunc(line.quantityThousandths / THOUSANDTHS);
  const rest = line.quantityThousandths % THOUSANDTHS;
  const number = rest === 0 ? String(whole) : `${String(whole)},${String(rest).padStart(3, '0')}`;
  return line.unitCode === 'KGM' ? `${number} kg` : number;
}

/** `1415` points de base → « 14,15 % ». */
export function basisPointsPercent(basisPoints: number): string {
  const whole = Math.trunc(basisPoints / BASIS_POINTS_PER_PERCENT);
  const rest = basisPoints % BASIS_POINTS_PER_PERCENT;
  return rest === 0 ? `${String(whole)} %` : `${String(whole)},${String(rest).padStart(2, '0')} %`;
}
