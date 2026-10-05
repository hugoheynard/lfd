import type { StatementCycleView } from '@lfd/contracts';

/** Le jour du 15 : loin de toute bascule de fuseau, le mois lu ne peut pas glisser. */
const MID_MONTH = 15;

/** `2026-09` → `septembre 2026`. */
export function monthLabel(month: string): string {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7)) - 1;
  return new Date(Date.UTC(year, index, MID_MONTH)).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Le libellé d'un cycle au sélecteur — le cycle en cours le dit (plan, Q2). */
export function cycleLabel(cycle: StatementCycleView): string {
  const label = monthLabel(cycle.month);
  return cycle.inProgress ? `${label} — en cours, non clos` : label;
}

/** `5.5` → `TVA 5,5 %`. Le taux est la clé numérique figée, jamais un `5.50`. */
export function vatRateLabel(rate: number): string {
  return `TVA ${String(rate).replace('.', ',')} %`;
}
