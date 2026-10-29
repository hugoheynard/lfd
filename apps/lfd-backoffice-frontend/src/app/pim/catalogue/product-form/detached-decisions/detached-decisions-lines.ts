import type { SaleReferenceDecisionKind, SaleReferenceDecisionView } from '@lfd/contracts';

const KIND_LABELS: Readonly<Record<SaleReferenceDecisionKind, string>> = {
  mercuriale: 'Mercuriale',
  price_rule: 'Règle de prix',
  price_floor: 'Plancher',
  volume_ladder: 'Barème de volume',
  volume_commitment: 'Engagement de volume',
  price_template: 'Gabarit',
};

const DATE = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeZone: 'Europe/Paris' });

export function decisionKindLabel(kind: SaleReferenceDecisionKind): string {
  return KIND_LABELS[kind];
}

/** La fenêtre lisible : « du 01/11/2026 au 30/11/2026 », « depuis le … », ou rien. */
export function decisionWindow(view: SaleReferenceDecisionView): string {
  if (view.validFrom === null) {
    return '';
  }
  const from = DATE.format(new Date(view.validFrom));
  return view.validTo === null
    ? `depuis le ${from}`
    : `du ${from} au ${DATE.format(new Date(view.validTo))}`;
}

/** Une ligne de la liste : famille, nom, société visée, fenêtre, pause. */
export function decisionLine(view: SaleReferenceDecisionView): string {
  const parts = [`${decisionKindLabel(view.kind)} « ${view.label} »`];
  if (view.companyId !== null) {
    parts.push(view.companyName ?? 'société introuvable');
  }
  const window = decisionWindow(view);
  if (window !== '') {
    parts.push(window);
  }
  if (view.paused) {
    parts.push('en pause');
  }
  return parts.join(' — ');
}

/** Une ligne de la liste, et ce que l'écran peut en faire. */
export interface DetachedDecisionLine {
  readonly id: string;
  readonly text: string;
  /** Une mercuriale, qui se reporte sur la nouvelle référence (§ 6 du plan). */
  readonly carriable: boolean;
  /** Elle est déjà debout sur la nouvelle référence : le report est fait. */
  readonly carried: boolean;
}

/**
 * Les lignes de l'ancienne référence, chacune marquée : une mercuriale se
 * reporte, sauf si elle est déjà debout sur la nouvelle (même identifiant).
 */
export function detachedDecisionLines(
  views: readonly SaleReferenceDecisionView[],
  onNewSku: readonly SaleReferenceDecisionView[],
): readonly DetachedDecisionLine[] {
  const carriedIds = new Set(
    onNewSku.filter((view) => view.kind === 'mercuriale').map((view) => view.id),
  );
  return views.map((view) => ({
    id: view.id,
    text: decisionLine(view),
    carriable: view.kind === 'mercuriale',
    carried: view.kind === 'mercuriale' && carriedIds.has(view.id),
  }));
}
