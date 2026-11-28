import type {
  DossierDispatchView,
  PlanVersionAuthorView,
  PlanVersionCause,
  PlanVersionLineChange,
  PlanVersionMarkView,
  PlanVersionResupplyChangeView,
  PlanVersionSaleUnit,
  PlanVersionShipmentChangeView,
  PlanVersionShipmentRef,
  PlanVersionUnexplainedExitView,
  PlanVersionView,
} from '@lfd/contracts';
import { saleQuantityLabel } from '@lfd/b2b-ui/catalog';

/**
 * **Les mots des versions du plan** — la liste, le diff et les envois du
 * dossier mis en phrases (`documentation/fournil/plan-historique-des-tirages.md`,
 * § 1.16 à 1.21). Le serveur rend des structures ; l'écran seul les dit, et
 * ces fonctions sont pures pour que chaque phrase s'éprouve sans rendu.
 */

const CAUSES: Readonly<Record<PlanVersionCause, string>> = {
  closed: 'Arrêt',
  auto_closed: 'Arrêt automatique',
  retaken: 'Retirage',
  order_revised: 'Commande révisée',
  order_withdrawn: 'Commande annulée',
  resupply_launched: 'Réassort lancé',
  opened_by_resupply: 'Journée ouverte par un réassort',
};

/** La cause d'une version, en mots. */
export function causeLabel(cause: PlanVersionCause): string {
  return CAUSES[cause];
}

/** Qui a fait le geste : le nom du staff, « l'équipe » s'il manque, « le client », « automatique ». */
export function authorLabel(author: PlanVersionAuthorView): string {
  switch (author.kind) {
    case 'staff':
      return author.name ?? 'l’équipe';
    case 'customer':
    case 'guest':
      return 'le client';
    case 'system':
      return 'automatique';
  }
}

const PARIS_TIME = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  hour: '2-digit',
  minute: '2-digit',
});

const PARIS_DAY = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

/** L'heure d'un instant ISO à Paris, comme on la dit : « 19 h 10 ». */
export function parisTime(iso: string): string {
  return PARIS_TIME.format(new Date(iso)).replace(':', ' h ');
}

/** Le jour et l'heure d'un instant ISO à Paris : « ven. 27 nov., 19 h 10 ». */
export function parisMoment(iso: string): string {
  return `${PARIS_DAY.format(new Date(iso))}, ${parisTime(iso)}`;
}

/** « Version 4 · tirage 1 » — ce que le papier de la version imprime en en-tête. */
export function versionTitle(version: Pick<PlanVersionView, 'version' | 'printRun'>): string {
  return `Version ${version.version} · tirage ${version.printRun}`;
}

/** Le papier d'une version, tel que la liste le dit. */
export type PaperState =
  | { readonly kind: 'stored' }
  | { readonly kind: 'not_stored' }
  | { readonly kind: 'unknown' }
  | { readonly kind: 'same_as'; readonly version: number }
  | { readonly kind: 'none' };

/**
 * Le papier d'une version : rangé, non rangé, le stockage n'a pas répondu, ou
 * — pour un retrait — celui d'une version précédente. Le dossier fait foi :
 * c'est lui qu'on rouvre.
 */
export function paperStateOf(view: Pick<PlanVersionView, 'version' | 'paper'>): PaperState {
  const { paper } = view;
  if (paper.version === null) {
    return { kind: 'none' };
  }
  if (paper.version !== view.version) {
    return { kind: 'same_as', version: paper.version };
  }
  if (paper.dossier === null) {
    return { kind: 'unknown' };
  }
  return paper.dossier ? { kind: 'stored' } : { kind: 'not_stored' };
}

/** Le papier en mots, quand il ne s'ouvre pas d'un lien. */
export function paperLabel(state: PaperState): string {
  switch (state.kind) {
    case 'stored':
      return 'Papier rangé';
    case 'not_stored':
      return 'Papier non rangé';
    case 'unknown':
      return 'Papier : le stockage n’a pas répondu';
    case 'same_as':
      return `Même papier que la version ${state.version}`;
    case 'none':
      return 'Aucun papier';
  }
}

/** Une quantité dans l'unité de l'article : « 12 », « 1,25 kg ». */
function quantity(amount: number, unit: PlanVersionSaleUnit): string {
  return saleQuantityLabel(amount, unit);
}

/** L'écart signé : « +15 », « −250 g », « 0 ». */
export function signedDelta(delta: number, unit: PlanVersionSaleUnit): string {
  if (delta === 0) {
    return quantity(0, unit);
  }
  const sign = delta > 0 ? '+' : '−';
  return `${sign}${quantity(Math.abs(delta), unit)}`;
}

/** Avant ou après, dans l'unité de l'article. */
export function amountLabel(amount: number, unit: PlanVersionSaleUnit): string {
  return quantity(amount, unit);
}

/** L'envoi nommé : sa référence, et son rang quand la commande en a plusieurs. */
export function shipmentLabel(shipment: PlanVersionShipmentRef): string {
  const name = shipment.reference ?? 'Une commande retirée';
  return shipment.rank > 1 ? `${name} (envoi ${shipment.rank})` : name;
}

function linesLabel(lines: readonly PlanVersionLineChange[]): string {
  return lines
    .map(
      (line) =>
        `${line.productName} ${quantity(line.before, line.saleUnit)} → ${quantity(line.after, line.saleUnit)}`,
    )
    .join(', ');
}

function enteredSentence(
  change: Extract<PlanVersionShipmentChangeView, { kind: 'entered' }>,
): string {
  const who = shipmentLabel(change.shipment);
  const at = parisTime(change.by.recordedAt);
  switch (change.reason) {
    case 'arrested':
      return `${who} au plan dès l’arrêt`;
    case 'retaken':
      return `${who} intégrée au retirage de ${at}`;
    case 'retaken_off_plan':
      return `${who} hors plan, intégrée au retirage de ${at}`;
    case 'rearrested':
      return `${who} refigée après réouverture`;
    case 'rearrested_off_plan':
      return `${who} refigée après réouverture (reçue hors plan)`;
    case 'unknown':
      return `${who} entrée au plan, sans trace de la façon`;
  }
}

/** Un changement d'envoi en une phrase, sans son auteur (voir `withAuthor`). */
export function changeSentence(change: PlanVersionShipmentChangeView): string {
  const who = shipmentLabel(change.shipment);
  switch (change.kind) {
    case 'entered':
      return enteredSentence(change);
    case 'revised':
      return `${who} révisée : ${linesLabel(change.lines)}`;
    case 'modified_during_reopen':
      return `${who} modifiée pendant la réouverture : ${linesLabel(change.lines)}`;
    case 'lines_changed':
      return `${who} changée : ${linesLabel(change.lines)}`;
    case 'withdrawn':
      return `${who} annulée après l’arrêt — toujours produite`;
    case 'left_after_withdrawal':
      return `${who} annulée, sortie du plan au nouvel arrêt`;
  }
}

/** Le réassort nommé : son point, et son nom quand il en a un. */
function resupplyName(change: PlanVersionResupplyChangeView): string {
  const site = change.siteLabel ?? 'sans point connu';
  return change.name === null ? `réassort ${site}` : `réassort ${site} (${change.name})`;
}

/** Un réassort en une phrase : « réassort Village lancé ». */
export function resupplySentence(change: PlanVersionResupplyChangeView): string {
  switch (change.kind) {
    case 'launched':
      return `${resupplyName(change)} lancé`;
    case 'entered':
      return `${resupplyName(change)} entré au plan`;
    case 'left':
      return `${resupplyName(change)} sorti du plan`;
  }
}

/** Une sortie dont la raison est au commerce, dite sans accuser. */
export function toCheckSentence(exit: PlanVersionUnexplainedExitView): string {
  return `${shipmentLabel(exit.shipment)} sortie du plan, raison au commerce`;
}

/**
 * L'auteur d'une version du diff. Le diff ne nomme pas par l'annuaire : on
 * relit la liste par numéro, et la marque elle-même sinon.
 */
export function markAuthor(
  mark: PlanVersionMarkView,
  versions: readonly Pick<PlanVersionView, 'version' | 'author'>[],
): string {
  const listed = versions.find((entry) => entry.version === mark.version);
  return authorLabel(listed?.author ?? mark.recordedBy);
}

/** La phrase et son auteur : « ORD-0031 révisée : Croissant 10 → 15 (Marie) ». */
export function withAuthor(sentence: string, author: string): string {
  return `${sentence} (${author})`;
}

/** Ce qu'un destinataire a reçu, au regard de la version courante. */
export type DispatchStanding =
  | { readonly kind: 'current'; readonly version: number }
  | { readonly kind: 'requested'; readonly version: number }
  | { readonly kind: 'outdated'; readonly version: number }
  | { readonly kind: 'unversioned' }
  | { readonly kind: 'nothing' };

/** `latest` : la version courante de la journée, `null` sans version. */
export function dispatchStandingOf(
  dispatch: DossierDispatchView,
  latest: number | null,
): DispatchStanding {
  const received = dispatch.lastReceived;
  if (received === null) {
    return { kind: 'nothing' };
  }
  if (received.planVersion === null) {
    return { kind: 'unversioned' };
  }
  if (latest !== null && received.planVersion < latest) {
    return { kind: 'outdated', version: received.planVersion };
  }
  // Un renvoi demandé compte comme reçu (le serveur le range en `lastReceived`),
  // mais l'écran ne dit pas « a reçu » : l'e-mail est confié à la boîte d'envoi.
  return dispatch.lastAttempt?.outcome === 'requested' && dispatch.lastAttempt.at === received.at
    ? { kind: 'requested', version: received.planVersion }
    : { kind: 'current', version: received.planVersion };
}

/** Ce qu'il a reçu, en mots. */
export function dispatchStandingLabel(standing: DispatchStanding): string {
  switch (standing.kind) {
    case 'current':
      return `A reçu la version ${standing.version}, la courante`;
    case 'requested':
      return `Version ${standing.version} demandée — l’e-mail part par la boîte d’envoi`;
    case 'outdated':
      return `A reçu la version ${standing.version} — dépassée`;
    case 'unversioned':
      return 'A reçu un dossier d’avant les versions';
    case 'nothing':
      return 'N’a encore rien reçu de cette journée';
  }
}

/** Faut-il le signaler ? Tout ce qui n'est pas la version courante, reçue ou demandée. */
export function dispatchNeedsAttention(standing: DispatchStanding): boolean {
  return standing.kind !== 'current' && standing.kind !== 'requested';
}

/** La question avant de renvoyer la courante à une personne. */
export function resendOneQuestion(version: number, name: string): string {
  return `Renvoyer le dossier version ${version} à ${name} ?`;
}

/** La question avant de renvoyer la courante à tous ceux qui ne l'ont pas. */
export function resendOutdatedQuestion(version: number, count: number): string {
  const whom = count === 1 ? '1 destinataire pas à jour' : `${count} destinataires pas à jour`;
  return `Renvoyer le dossier version ${version} à ${whom} ?`;
}
