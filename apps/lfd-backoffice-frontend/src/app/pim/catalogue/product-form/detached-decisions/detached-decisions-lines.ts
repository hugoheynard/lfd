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
  readonly kind: SaleReferenceDecisionKind;
  readonly text: string;
  /**
   * Elle se reporte sur la nouvelle référence — toutes les familles depuis le
   * plan de report (`plan-report-apres-detachement.md`, § 5) ; le gabarit, lui,
   * s'édite (« Remplacer dans le gabarit »).
   */
  readonly carriable: boolean;
  /** Le report est déjà fait : la nouvelle référence porte la décision reportée. */
  readonly carried: boolean;
}

/**
 * **Déjà reportée ?** Une mercuriale et un gabarit gardent leur identifiant
 * (un avenant, une ligne remplacée) : ils se retrouvent tels quels sur la
 * nouvelle référence. Les autres familles posent une décision NEUVE qui dit
 * d'où elle vient (`origin`) : même famille, venue de l'ancienne, et soit de
 * cette décision, soit de la même audience — un plancher change d'identifiant
 * à chaque version, le serveur juge par l'audience (§ 3).
 */
function isCarried(
  view: SaleReferenceDecisionView,
  onNewSku: readonly SaleReferenceDecisionView[],
  oldSku: string,
): boolean {
  if (view.kind === 'mercuriale' || view.kind === 'price_template') {
    return onNewSku.some((other) => other.kind === view.kind && other.id === view.id);
  }
  return onNewSku.some(
    (other) =>
      other.kind === view.kind &&
      other.origin?.fromSku === oldSku &&
      (other.origin.fromDecisionId === view.id ||
        (other.label === view.label && other.companyId === view.companyId)),
  );
}

/**
 * Les lignes de l'ancienne référence, chacune marquée : toute décision se
 * reporte, sauf si la nouvelle porte déjà son report.
 */
export function detachedDecisionLines(
  views: readonly SaleReferenceDecisionView[],
  onNewSku: readonly SaleReferenceDecisionView[],
  oldSku: string,
): readonly DetachedDecisionLine[] {
  return views.map((view) => ({
    id: view.id,
    kind: view.kind,
    text: decisionLine(view),
    carriable: true,
    carried: isCarried(view, onNewSku, oldSku),
  }));
}

/**
 * **Ce que « Tout reporter » reporte** (Hugo, 2026-10-30, § 7 bis) : les
 * lignes à reporter que la personne a le droit de poser — un plancher sous
 * les limites de prix, le reste sous la tarification. Le reste attend
 * quelqu'un qui en a le droit, et la liste le montre toujours.
 */
export function linesToCarryAll(
  lines: readonly DetachedDecisionLine[],
  can: (kind: SaleReferenceDecisionKind) => boolean,
): readonly DetachedDecisionLine[] {
  return lines.filter((line) => line.carriable && !line.carried && can(line.kind));
}
