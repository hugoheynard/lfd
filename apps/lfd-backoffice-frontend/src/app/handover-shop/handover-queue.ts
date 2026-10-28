import type {
  FulfillmentSource,
  HandoverQueueEntryView,
  HandoverQueueState,
  HandoverQueueWindowView,
  OrderHandoverView,
} from '@lfd/contracts';
import type { FoldBadgeVariant, FoldTableTone } from 'fold-ng';

import { searchKey } from '../shared/search/search-key';
import { fulfillmentWindowLabel } from '../shared/window-label';

/**
 * **La logique de la file de retrait**, hors de tout composant : dérivation des
 * onglets, ordre de la file, écriture d'un créneau, et la seule décision qui
 * peut faire du tort — celle de parler de retard.
 *
 * Rien ici ne touche au DOM ni à Angular : c'est ce qui rend ces quatre règles
 * éprouvables une par une, alors qu'un gabarit ne se teste qu'en le rendant.
 */

/**
 * **Ce qui se remet AU COMPTOIR** — les retraits, et rien d'autre.
 *
 * 🔴 Le critère est l'acheminement, pas l'absence de point. Les deux se
 * confondaient : une livraison n'a pas de point de retrait, mais une commande
 * antérieure aux points de retrait n'en a pas non plus, et elle se remet bien
 * en boutique. Couper sur `pickupLabel === null` ferait disparaître la seconde
 * de tous les écrans — exactement ce que l'onglet « Sans point de retrait »
 * avait été créé pour empêcher.
 *
 * Une livraison part par coursier : personne ne l'attend devant ce comptoir, et
 * elle aura son propre écran. La laisser ici faisait compter « en attente » des
 * sacs que le comptoir ne tendra jamais.
 */
export function atTheCounter(
  entries: readonly HandoverQueueEntryView[],
): readonly HandoverQueueEntryView[] {
  return entries.filter((entry) => entry.fulfillmentMethod !== 'delivery');
}

/**
 * L'onglet des lignes **sans point de retrait** : une livraison par coursier,
 * ou une commande antérieure aux points de retrait.
 *
 * 🔴 Il existe pour que ces lignes ne disparaissent pas. Des onglets dérivés
 * des seuls `pickupLabel` présents les laisseraient hors de tout onglet, donc
 * hors de l'écran — et une commande introuvable au comptoir est exactement ce
 * que cette page doit empêcher.
 */
export const NO_PICKUP = '__none__';

/**
 * Le rang de tri d'une ligne **sans créneau**. Supérieur à tout `HH:mm`, donc
 * elle descend en fin de file — sans qu'on lui ait attribué d'heure.
 */
const WITHOUT_WINDOW_RANK = '99:99';

/**
 * Seul un créneau `override` est une tranche réellement demandée.
 *
 * 🔴 **Annoté**, et c'est tout le sujet de cette constante depuis le
 * 2026-09-11. `source` traversait le contrat en `string` alors que
 * `FulfillmentSource` existait déjà : une faute de frappe ici — `'overide'`,
 * `'override '` — compilait, passait le lint, et inversait la condition sur
 * TOUTE la file. Les tests ne l'auraient pas vue, puisque leurs fixtures
 * écrivent le même littéral que le code. Le type ne peut pas se tromper des
 * deux côtés.
 */
const REQUESTED_SOURCE: FulfillmentSource = 'override';

/** Ce dans quoi on cherche : tout ce que la ligne MONTRE, et rien de plus. */
function haystack(entry: HandoverQueueEntryView): string {
  // 🔴 Pas l'identifiant technique : on ne cherche pas une commande par son
  // `orderId`, et l'y inclure ferait correspondre des lignes sans que rien à
  // l'écran n'explique pourquoi.
  return searchKey(
    [
      entry.customerLabel,
      entry.tradeName ?? '',
      entry.reference,
      formatWindow(entry.window) ?? '',
      entry.pickupLabel ?? '',
    ].join(' '),
  );
}

/**
 * **Les lignes que le terme laisse** — un filtre de ce qui est affiché, jamais
 * une requête.
 *
 * 🔴 Une fonction pure, et c'est tout le sujet : la barre doit ANNONCER combien
 * il reste, la table doit les PEINDRE. La première version demandait le compte
 * à la seconde par une requête de vue, et Angular levait `NG0950` — l'instance
 * existe avant que ses entrées soient liées, donc la barre lisait une file qui
 * n'avait pas encore de lignes. Deux appels d'une même fonction pure n'ont pas
 * ce problème, et ne peuvent pas diverger.
 */
export function matchingQueue(
  entries: readonly HandoverQueueEntryView[],
  query: string,
): readonly HandoverQueueEntryView[] {
  const needle = searchKey(query);
  if (needle === '') {
    return entries;
  }
  return entries.filter((entry) => haystack(entry).includes(needle));
}

/** Un onglet de point de retrait, avec le nombre de lignes qu'il porte. */
export interface HandoverTab {
  readonly key: string;
  readonly label: string;
  readonly count: number;
}

/** Un site qui remet, tel que le comptoir le connaît : son id et son nom du moment. */
export interface CounterPlace {
  readonly id: string;
  readonly label: string;
}

/**
 * **La clé d'onglet d'une ligne : l'id de son site** (lot S2, 2026-10-13), et
 * non plus son libellé — deux sites peuvent porter un nom proche, et un site
 * renommé ne doit pas couper sa file en deux.
 *
 * 🔴 **Repli sur le libellé, pour les commandes passées avant S2** : leur
 * snapshot ne porte pas d'id, et rien ne les rattrape en base (Q-S2, un
 * rattrapage par libellé serait irréversible). Ici, le repli n'écrit rien :
 * une ligne sans `siteId` rejoint le site connu qui porte son libellé, sinon
 * un onglet à son libellé figé. Il disparaîtra avec la dernière commande
 * d'avant le lot (S3r).
 */
export function tabKeyOf(entry: HandoverQueueEntryView, places: readonly CounterPlace[]): string {
  const siteId = entry.siteId ?? null;
  if (siteId !== null && siteId !== '') {
    return siteId;
  }
  const label = entry.pickupLabel?.trim() ?? '';
  if (label === '') {
    return NO_PICKUP;
  }
  return places.find((place) => place.label === entry.pickupLabel)?.id ?? label;
}

/**
 * Les onglets, dérivés des sites **connus** et de ceux **présents dans la
 * réponse** — aucun nom de point n'est écrit ici, et c'est volontaire : un
 * point ouvert demain apparaîtrait sinon nulle part.
 *
 * 🔴 **Un onglet par point, et RIEN au-dessus.** Il y avait un « Tous les
 * points » en tête ; il est parti le 2026-09-11. On ne tend pas un sac depuis
 * deux comptoirs à la fois : la personne qui lit cet écran est DANS un point,
 * et la file des autres ne lui sert qu'à allonger la sienne. L'onglet fourre-
 * tout était la vue d'un gérant sur un écran d'exécutant.
 *
 * Les compteurs de la bande suivent le même raisonnement depuis le même jour :
 * ils portent sur le point ouvert, et non sur la journée. Les laisser à la
 * journée aurait gardé, en chiffres, la vue qu'on venait de retirer en onglets.
 *
 * Le nom d'un onglet est celui du site AUJOURD'HUI ; un site absent de la
 * liste (archivé depuis) garde le nom figé sur sa commande.
 */
export function pickupTabs(
  entries: readonly HandoverQueueEntryView[],
  places: readonly CounterPlace[] = [],
): readonly HandoverTab[] {
  // Tous les points connus, même sans commande (Hugo, 2026-10-12) : le
  // réassort se fait par point, et un point vide doit rester choisissable.
  const groups = new Map<string, { label: string; count: number }>(
    places.map((place) => [place.id, { label: place.label, count: 0 }]),
  );
  let withoutPickup = 0;
  for (const entry of entries) {
    const key = tabKeyOf(entry, places);
    if (key === NO_PICKUP) {
      withoutPickup += 1;
      continue;
    }
    const group = groups.get(key) ?? { label: frozenLabelOf(entry, key), count: 0 };
    groups.set(key, { label: group.label, count: group.count + 1 });
  }

  const tabs: HandoverTab[] = [...groups.entries()]
    .sort(([, left], [, right]) => left.label.localeCompare(right.label, 'fr'))
    .map(([key, group]) => ({ key, label: group.label, count: group.count }));
  if (withoutPickup > 0) {
    tabs.push({ key: NO_PICKUP, label: 'Sans point de retrait', count: withoutPickup });
  }
  return tabs;
}

/** Le nom figé sur la commande — celui d'un site que le comptoir ne connaît plus. */
function frozenLabelOf(entry: HandoverQueueEntryView, key: string): string {
  const label = entry.pickupLabel?.trim() ?? '';
  return label === '' ? key : label;
}

/**
 * Les lignes d'un onglet, par la même clé que {@link pickupTabs}. Une clé
 * inconnue ne filtre rien plutôt que de vider.
 */
export function entriesForTab(
  entries: readonly HandoverQueueEntryView[],
  key: string,
  places: readonly CounterPlace[] = [],
): readonly HandoverQueueEntryView[] {
  return key === '' ? entries : entries.filter((entry) => tabKeyOf(entry, places) === key);
}

/**
 * La file, **par créneau puis par heure de commande**.
 *
 * Une ligne sans créneau n'a pas d'heure : elle ne s'en voit pas attribuer une,
 * elle passe en fin de file et se départage à l'heure de commande. Le rang
 * d'une tranche est sa borne basse quand elle en a une — sinon sa borne haute,
 * qui est alors tout ce qu'on sait d'elle (« avant `end` »).
 */
export function sortedQueue(
  entries: readonly HandoverQueueEntryView[],
): readonly HandoverQueueEntryView[] {
  return [...entries].sort((left, right) => {
    const byWindow = windowRank(left.window).localeCompare(windowRank(right.window));
    return byWindow === 0 ? left.placedAt.localeCompare(right.placedAt) : byWindow;
  });
}

function windowRank(window: HandoverQueueWindowView | null): string {
  if (window === null) {
    return WITHOUT_WINDOW_RANK;
  }
  return window.start ?? window.end;
}

/**
 * Le créneau, écrit — ou `null` quand il n'y en a pas, pour que l'appelant dise
 * l'absence avec ses mots plutôt que de recevoir une heure inventée.
 *
 * 🔴 Une borne basse absente ne se rend PAS en `— – 6 h 30` : le contrat dit
 * « avant `end` », pas « d'une heure inconnue à `end` ». Un tiret à la place de
 * la borne se lit comme une donnée manquante, alors qu'elle est absente
 * exprès.
 */
export function formatWindow(window: HandoverQueueWindowView | null): string | null {
  if (window === null) {
    return null;
  }
  return fulfillmentWindowLabel(window);
}

/**
 * `06:30` → `6 h 30`. Espaces insécables : une heure coupée en fin de ligne se
 * relit deux fois. Une valeur qu'on ne sait pas lire est rendue telle quelle —
 * l'écran montre alors ce que le serveur a dit, ce qui est toujours vrai.
 */
export function formatHour(value: string): string {
  const [hours, minutes] = value.split(':');
  if (hours === undefined || minutes === undefined || !/^\d{1,2}$/u.test(hours)) {
    return value;
  }
  return `${Number(hours)}\u00a0h\u00a0${minutes}`;
}

/**
 * **Peut-on dire que cette ligne est en retard ?**
 *
 * 🔴 Non sur un créneau `default` : il vient d'un réglage, donc d'une
 * disponibilité, pas d'une promesse faite à quelqu'un. Reprocher un retard sur
 * une heure que personne n'a demandée est un reproche adressé à la mauvaise
 * partie.
 *
 * ⚠️ **Cette garde ne filtre rien aujourd'hui, et se garde quand même**
 * (vérifié le 2026-09-11). Un retrait ne prend aucun défaut — le serveur le
 * refuse explicitement, les heures d'un point étant une contrainte d'ouverture
 * partagée —, donc toute fenêtre qui arrive ici a été demandée. Elle
 * redeviendra vivante le jour où la saisie staff gagnera un créneau, ou où les
 * livraisons auront leur file ; d'ici là elle coûte une comparaison et évite
 * qu'on redécouvre la règle par une alarme.
 *
 * ⚠️ Sa justification a été **fausse** jusqu'à cette date : elle invoquait un
 * backfill du 2026-08-15 qui aurait posé une heure sur toutes les commandes
 * antérieures. Il a posé l'inverse — une provenance avec `value: null`, c'est-
 * à-dire aucun créneau — et le disait dans son propre en-tête. Une garde
 * défendue par un danger qui n'existe pas se fait retirer au premier ménage.
 *
 * Non plus sur une commande **retirée** (le sac est parti) ni **annulée** (rien
 * ne partira) : dans les deux cas l'heure ne promet plus rien.
 *
 * @param day Le jour de service `AAAA-MM-JJ` de la file — le créneau ne porte
 *   qu'une heure, et l'heure seule ne se compare à rien.
 */
export function isLate(entry: HandoverQueueEntryView, day: string, now: Date): boolean {
  const window = entry.window;
  if (window === null || window.source !== REQUESTED_SOURCE) {
    return false;
  }
  if (entry.state === 'handed_over' || entry.state === 'cancelled') {
    return false;
  }
  const deadline = new Date(`${day}T${window.end}:00`);
  return !Number.isNaN(deadline.getTime()) && now.getTime() > deadline.getTime();
}

/**
 * **De combien de minutes cette ligne est-elle en retard ?** `null` si elle ne
 * l'est pas.
 *
 * 🔴 C'est `isLate` qui décide, et non une seconde comparaison écrite ici : les
 * deux finiraient par diverger, et celle qui dérive est toujours celle qui
 * affiche — donc celle qu'on croit. Cette fonction ne fait que **chiffrer** une
 * décision déjà prise.
 */
export function lateMinutes(entry: HandoverQueueEntryView, day: string, now: Date): number | null {
  if (!isLate(entry, day, now)) {
    return null;
  }
  const window = entry.window;
  if (window === null) {
    // Inatteignable : `isLate` a déjà refusé une ligne sans créneau. On le dit
    // au typeur plutôt qu'à coups de `!`.
    return null;
  }
  const deadline = new Date(`${day}T${window.end}:00`);
  return Math.floor((now.getTime() - deadline.getTime()) / MINUTE_MS);
}

const MINUTE_MS = 60_000;

/**
 * « 56 min de retard », puis « 1 h 20 de retard ».
 *
 * ⚠️ Les espaces sont INSÉCABLES, et écrites `\u00a0` plutôt qu'insérées : un
 * caractère invisible dans une chaîne se fait « corriger » au premier passage
 * de quelqu'un qui le prend pour une faute de frappe. Même raison que dans
 * {@link formatHour} — une durée coupée en fin de ligne se relit deux fois.
 *
 * Le basculement à l'heure n'est pas cosmétique : passé soixante, les minutes
 * cessent d'être une durée qu'on se représente. « 143 min » se convertit de
 * tête au comptoir, ce qui est exactement le travail qu'un écran doit prendre.
 */
export function lateLabel(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}\u00a0min de retard`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0
    ? `${hours}\u00a0h de retard`
    : `${hours}\u00a0h\u00a0${String(rest).padStart(2, '0')} de retard`;
}

/** Ce que la bande de tête annonce : l'état de la matinée en trois nombres. */
export interface QueueCounters {
  readonly total: number;
  readonly handedOver: number;
  readonly late: number;
  /** Ni retirées, ni annulées — ce qu'il reste réellement à tendre. */
  readonly waiting: number;
  /**
   * Parmi `waiting`, celles que le contrôle qualité retient (lot QC5).
   *
   * 🔴 **Un sous-compte, pas un quatrième tiroir.** Une retenue reste « en
   * attente » : le sac est là, le client viendra, et le contrôle se lève le
   * plus souvent dans la matinée. La sortir de `waiting` ferait fondre le
   * compteur au moment où l'on retient — et remonter d'un coup à la levée,
   * sans qu'aucun sac n'ait bougé.
   */
  readonly held: number;
}

/**
 * Les trois compteurs, **sur les lignes qu'on lui donne**.
 *
 * 🔴 Elle ne décide PAS du périmètre, et c'est délibéré : elle compte ce qu'on
 * lui passe. L'écran lui passe l'onglet ouvert depuis le 2026-09-11 — qui lit
 * cet écran est DANS un point, et « 3 en retard » dont deux ailleurs le fait
 * chercher des sacs qui ne sont pas chez lui.
 *
 * ⚠️ Ce JSDoc a affirmé l'inverse — « la journée, tous points confondus » — et
 * il l'a affirmé APRÈS que l'appelant eut changé, le même jour. C'est le
 * commentaire dangereux par excellence : il décrit non pas cette fonction, qui
 * n'a jamais rien décidé, mais la façon dont un AUTRE fichier l'appelle. Un
 * lecteur qui « corrigeait » l'appelant pour honorer cette phrase rouvrait le
 * défaut qu'on venait de fermer.
 */
export function queueCounters(
  entries: readonly HandoverQueueEntryView[],
  day: string,
  now: Date,
): QueueCounters {
  let handedOver = 0;
  let late = 0;
  let waiting = 0;
  let held = 0;
  for (const entry of entries) {
    if (entry.state === 'handed_over') {
      handedOver += 1;
    } else if (entry.state !== 'cancelled') {
      waiting += 1;
    }
    if (heldAtTheCounter(entry)) {
      held += 1;
    }
    if (isLate(entry, day, now)) {
      late += 1;
    }
  }
  return { total: entries.length, handedOver, late, waiting, held };
}

/** `06:41` d'un instant, en heure locale — de quoi nourrir {@link formatHour}. */
export function clockOf(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * **Peut-on encore tendre ce sac ?** — la règle du serveur, dite pour l'œil.
 *
 * 🔴 Elle était écrite à l'identique dans `queue-table.ts` ET
 * `handover-detail.ts` (revue du 2026-09-11, point 4). Deux copies d'une règle
 * métier ne divergent pas le jour où on les écrit : elles divergent le jour où
 * un cinquième état apparaît et où **un seul des deux fichiers** est touché —
 * la file offrirait alors un geste que le rail refuse, sur la même ligne.
 *
 * ⚠️ **Le serveur reste l'autorité.** `handoverBlocker` décide, et il rend une
 * phrase ; cette fonction ne fait qu'éviter d'armer un bouton dont on connaît
 * déjà la réponse. Elle est donc permissive de la même façon : tout état qui
 * n'est ni « retirée » ni « annulée » passe, y compris une commande que le
 * fournil n'a pas encore déclarée prête — renvoyer un client physiquement là,
 * colis prêt, parce qu'un écran d'atelier n'a pas été cliqué serait pire.
 *
 * Un cinquième membre de l'union passerait donc ici, comme il passe là-bas.
 * C'est voulu, et `handover-queue.spec.ts` le fait constater en refusant de
 * compiler quand l'ensemble s'élargit, plutôt que de laisser un `default`
 * silencieux en décider.
 */
export function stillRemittable(state: HandoverQueueState): boolean {
  return state !== 'handed_over' && state !== 'cancelled';
}

/**
 * **Le contrôle qualité retient-il ce sac, ICI ?** (plan
 * `fournil/plan-controle-qualite.md`, D4 et §5.)
 *
 * 🔴 Jamais sur une commande retirée ou annulée : le serveur lit la retenue
 * APRÈS « déjà retirée » (D4), et l'écran dit la même chose dans le même
 * ordre. Une retenue posée sur un sac parti est inoffensive — l'afficher ferait
 * chercher au comptoir un sac qui n'y est plus.
 *
 * ⚠️ Un signal AVANT le scan, pas une garde : le refus du serveur reste la
 * garantie (« Commande en cours de vérification. »).
 */
export function heldAtTheCounter(entry: HandoverQueueEntryView): boolean {
  return entry.heldForQuality && stillRemittable(entry.state);
}

/** Ce que dit la pastille d'une commande retenue — le mot de la Supervision. */
export const QUALITY_HOLD_LABEL = 'En vérification';

/**
 * La pastille d'une LIGNE : la retenue d'abord, l'état sinon.
 *
 * La retenue passe devant « Prête » : un sac prêt qu'on ne doit pas tendre est
 * exactement ce que la pastille doit arrêter avant le scan.
 */
export function entryStateLabel(entry: HandoverQueueEntryView): string {
  return heldAtTheCounter(entry) ? QUALITY_HOLD_LABEL : stateLabel(entry.state);
}

/** Le ton de la pastille d'une ligne, selon la même préséance. */
export function entryStateVariant(entry: HandoverQueueEntryView): FoldBadgeVariant {
  return heldAtTheCounter(entry) ? 'alert' : stateVariant(entry.state);
}

/** L'état, dans les mots du comptoir. */
export function stateLabel(state: HandoverQueueState): string {
  switch (state) {
    case 'handed_over':
      return 'Retirée';
    case 'ready':
      return 'Prête';
    case 'cancelled':
      return 'Annulée';
    default:
      return 'Attendue';
  }
}

/** Le ton du badge d'état. */
export function stateVariant(state: HandoverQueueState): FoldBadgeVariant {
  switch (state) {
    case 'handed_over':
      return 'success';
    case 'ready':
      return 'accent';
    case 'cancelled':
      return 'alert';
    default:
      return 'neutral';
  }
}

/**
 * Le ton de la ligne. Deux seulement, et l'annulation gagne : une commande
 * annulée dont le client se présente est le cas où l'équipe a le moins de temps
 * pour lire.
 */
export function rowTone(entry: HandoverQueueEntryView, day: string, now: Date): FoldTableTone {
  if (entry.state === 'cancelled') {
    return 'alert';
  }
  return isLate(entry, day, now) ? 'warning' : null;
}

/**
 * **Ce que le code scanné a de dépaysant**, en clair — ou `null` si rien.
 *
 * ## Pourquoi ça n'interdit pas
 *
 * Un comptoir prend ce qui se présente, et le code résout la commande tout
 * seul : refuser renverrait quelqu'un qui est physiquement là, sac compris.
 * Un sac transporté d'un point à l'autre, un client redirigé par téléphone, une
 * livraison rattrapée au comptoir — les trois existent, et le retrait y est
 * légitime. Même permissivité que `handoverBlocker` côté serveur, et pour la
 * même raison : le monde réel prime sur la machine à états.
 *
 * ## Ce que la phrase sert VRAIMENT
 *
 * 🔴 Moins à empêcher un faux retrait qu'à **expliquer pourquoi le sac n'est
 * pas là**. Si le client s'est trompé de point, la marchandise est à l'autre
 * bout : l'opérateur cherche dans son rack, ne trouve rien, et sans cette
 * phrase il ne sait pas s'il cherche mal ou si le sac n'a jamais existé. Elle
 * lui donne la réponse, et ce qu'il dit au client.
 *
 * Les DEUX points sont nommés, comme les deux numéros du refus de code : sans
 * eux on ne sait pas si c'est le client ou l'onglet qui est au mauvais endroit.
 *
 * @param subject ce que le code a désigné, tel que le serveur le rend.
 * @param openTab la clé de l'onglet ouvert — `''` quand l'écran n'affirme aucun
 *   périmètre, et il n'y a alors rien à signaler.
 */
export function outsideTheCounter(
  subject: Pick<OrderHandoverView, 'fulfillmentMethod' | 'pickupLabel'>,
  openTab: string,
): string | null {
  if (subject.fulfillmentMethod === 'delivery') {
    // La file ne montre plus aucune livraison depuis `atTheCounter` : ce code
    // n'a donc AUCUNE ligne à l'écran, quel que soit l'onglet ouvert.
    return 'Cette commande part en livraison — elle n’est dans aucune file de comptoir.';
  }
  if (openTab === '') {
    return null;
  }
  const nowhere = subject.pickupLabel === null || subject.pickupLabel.trim() === '';
  if (openTab === NO_PICKUP) {
    return nowhere
      ? null
      : `Cette commande est rattachée à « ${subject.pickupLabel ?? ''} », pas à « Sans point de retrait ».`;
  }
  if (nowhere) {
    return `Cette commande ne porte aucun point de retrait, et l’onglet ouvert est « ${openTab} ».`;
  }
  return subject.pickupLabel === openTab
    ? null
    : `Cette commande est rattachée à « ${subject.pickupLabel ?? ''} », pas à « ${openTab} ».`;
}

/**
 * **La preuve du code**, gardée entre le scan et la remise.
 *
 * Le scan identifie ; la remise se fait sur la fiche (2026-10-25). Ce qui
 * relie les deux est ce jeton, lu à l'instant, et la commande qu'il désigne :
 * « Remettre la commande » le renvoie, et le serveur grave `scan`. Sans lui,
 * la fiche ne connaît que la remise sans code.
 */
export interface ScanProof {
  readonly orderId: string;
  readonly token: string;
  /** Ce que le code a de surprenant — autre commande, autre point — ou `null`. */
  readonly notice: string | null;
}

/**
 * Ce que l'écran dit en ouvrant la fiche que le code désigne.
 *
 * 🔴 Un code d'une AUTRE commande que celle ouverte n'est plus refusé : il
 * ouvre l'autre fiche — c'est elle que le client présente — mais en nommant
 * les deux numéros. Sans eux, l'équipe ne sait pas si elle s'est trompée de
 * ligne ou de client. Le dépaysement de point suit, par `outsideTheCounter`.
 */
export function scanNotice(
  subject: Pick<OrderHandoverView, 'orderNumber' | 'fulfillmentMethod' | 'pickupLabel'>,
  expectedReference: string | null,
  openTab: string,
): string | null {
  if (expectedReference !== null && subject.orderNumber !== expectedReference) {
    return `Ce code désigne ${subject.orderNumber}, pas ${expectedReference}. C’est la fiche de ${subject.orderNumber} qui est ouverte : vérifiez le sac avant de remettre.`;
  }
  return outsideTheCounter(subject, openTab);
}
