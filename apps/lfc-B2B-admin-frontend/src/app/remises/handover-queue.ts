import type {
  HandoverQueueEntryView,
  HandoverQueueState,
  HandoverQueueWindowView,
} from '@lfd/contracts';
import type { FoldBadgeVariant, FoldTableTone } from 'fold-ng';

/**
 * **La logique de la file de remise**, hors de tout composant : dérivation des
 * onglets, ordre de la file, écriture d'un créneau, et la seule décision qui
 * peut faire du tort — celle de parler de retard.
 *
 * Rien ici ne touche au DOM ni à Angular : c'est ce qui rend ces quatre règles
 * éprouvables une par une, alors qu'un gabarit ne se teste qu'en le rendant.
 */

/** L'onglet qui ne filtre rien — la file entière, tous points confondus. */
export const ALL_PICKUPS = '__all__';

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

/** Seul un créneau `override` est une tranche réellement demandée. */
const REQUESTED_SOURCE = 'override';

/** Un onglet de point de retrait, avec le nombre de lignes qu'il porte. */
export interface HandoverTab {
  readonly key: string;
  readonly label: string;
  readonly count: number;
}

/**
 * Les onglets, dérivés des `pickupLabel` **présents dans la réponse** — aucun
 * nom de point n'est écrit ici, et c'est volontaire : un point ouvert demain
 * apparaîtrait sinon nulle part.
 *
 * L'onglet « Tous les points » n'est ajouté qu'à partir de deux groupes : sur
 * un comptoir unique, il ferait deux onglets qui montrent la même file.
 */
export function pickupTabs(entries: readonly HandoverQueueEntryView[]): readonly HandoverTab[] {
  const counts = new Map<string, number>();
  let withoutPickup = 0;
  for (const entry of entries) {
    const label = entry.pickupLabel;
    if (label === null || label.trim() === '') {
      withoutPickup += 1;
    } else {
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }

  const groups: HandoverTab[] = [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right, 'fr'))
    .map(([label, count]) => ({ key: label, label, count }));
  if (withoutPickup > 0) {
    groups.push({ key: NO_PICKUP, label: 'Sans point de retrait', count: withoutPickup });
  }
  if (groups.length < 2) {
    return groups;
  }
  return [{ key: ALL_PICKUPS, label: 'Tous les points', count: entries.length }, ...groups];
}

/** Les lignes d'un onglet. Une clé inconnue ne filtre rien plutôt que de vider. */
export function entriesForTab(
  entries: readonly HandoverQueueEntryView[],
  key: string,
): readonly HandoverQueueEntryView[] {
  if (key === NO_PICKUP) {
    return entries.filter((entry) => entry.pickupLabel === null || entry.pickupLabel.trim() === '');
  }
  if (key === ALL_PICKUPS) {
    return entries;
  }
  const known = entries.some((entry) => entry.pickupLabel === key);
  return known ? entries.filter((entry) => entry.pickupLabel === key) : entries;
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
  const end = formatHour(window.end);
  return window.start === null ? end : `${formatHour(window.start)} – ${end}`;
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
 * 🔴 Non sur un créneau `default` : c'est une heure d'ouverture du point,
 * recopiée à la commande, pas une promesse faite à quelqu'un. Le backfill du
 * 2026-08-15 en a posé une sur l'intégralité des commandes antérieures — un
 * retard calculé dessus allumerait le portefeuille entier d'un coup, un matin,
 * sans qu'aucune commande n'ait bougé.
 *
 * Non plus sur une commande **remise** (le sac est parti) ni **annulée** (rien
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
  /** Ni remises, ni annulées — ce qu'il reste réellement à tendre. */
  readonly waiting: number;
}

/**
 * Les compteurs de la journée, **tous points confondus**.
 *
 * Sur la file entière et non sur l'onglet actif : le nombre qu'on vient
 * chercher en levant les yeux est « combien reste-t-il ce matin », pas
 * « combien en reste-t-il dans l'onglet que je regarde ». Les compteurs par
 * point, eux, sont déjà sur les onglets.
 */
export function queueCounters(
  entries: readonly HandoverQueueEntryView[],
  day: string,
  now: Date,
): QueueCounters {
  let handedOver = 0;
  let late = 0;
  let waiting = 0;
  for (const entry of entries) {
    if (entry.state === 'handed_over') {
      handedOver += 1;
    } else if (entry.state !== 'cancelled') {
      waiting += 1;
    }
    if (isLate(entry, day, now)) {
      late += 1;
    }
  }
  return { total: entries.length, handedOver, late, waiting };
}

/** `06:41` d'un instant, en heure locale — de quoi nourrir {@link formatHour}. */
export function clockOf(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** L'état, dans les mots du comptoir. */
export function stateLabel(state: HandoverQueueState): string {
  switch (state) {
    case 'handed_over':
      return 'Remise';
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
