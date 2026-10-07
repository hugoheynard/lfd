import { slotsFor } from '@lfd/contracts';
import type {
  DeliveryAddressPayload,
  DeliveryAddressView,
  DeliveryContact,
  DeliverySlot,
  DeliverySpecs,
  GpsPoint,
  PreferredDeadlines,
  PreferredSlots,
  Weekday,
  WindowMode,
} from '@lfd/contracts';

import {
  EMPTY_POSTAL_DRAFT,
  gpsIssueOf,
  postalDraftFrom,
  postalIssue,
  toBillingPayload,
  type PostalDraft,
} from './postal-draft.model';

/**
 * Ce qu'une adresse de **livraison** ajoute au postal : quand on vient, à qui
 * on remet, et ce qu'on fait si personne n'ouvre.
 *
 * Ces champs n'existent que pour la livraison — c'est pourquoi ils sont un
 * type à part plutôt qu'une moitié muette d'un brouillon commun. Une
 * facturation ne les porte pas, donc personne n'a à se souvenir de les ignorer.
 */
export interface DeliverySpecsDraft {
  /** L'adresse proposée d'office au panier. */
  readonly isDefault: boolean;
  /** Les mêmes créneaux tous les jours, ou une liste par jour (CA3b). */
  readonly sameEveryDay: boolean;
  /** Les créneaux de tous les jours — triés, sans chevauchement. */
  readonly everySlots: readonly DeliverySlot[];
  /** Les créneaux jour par jour — une liste vide = aucun ce jour-là. */
  readonly daySlots: DraftDaySlots;
  readonly noContact: boolean;
  readonly contactPrenom: string;
  readonly contactNom: string;
  readonly contactTel: string;
  /**
   * Ce site déroge-t-il au socle de signature de la société ? `null` = il
   * hérite, et c'est l'état de départ d'une adresse neuve : une adresse qui
   * n'a rien décidé ne doit pas figer ce que la société décidera demain.
   */
  readonly signatureRequired: boolean | null;
  /**
   * Le **temps de livraison sur place** de ce site, en minutes (plan de
   * tournée, L7b-C4). `null` = le réglage général du calcul. Réglage
   * d'organisation, saisi par le staff seul ; le brouillon le porte quand même
   * côté client pour le RENVOYER tel quel : le carnet réécrit les consignes en
   * bloc, et une correction du client l'effacerait sinon.
   */
  readonly stopMinutes: number | null;
  /**
   * **Créneau ou échéance** pour ce site (CA-D2). `null` = il hérite du réglage
   * général de livraison — l'état d'une adresse neuve, pour la même raison que
   * la signature : ne pas figer ce que le commerce décidera demain.
   */
  readonly windowMode: WindowMode | null;
  /** Les mêmes échéances tous les jours, ou une liste par jour. */
  readonly sameDeadlinesEveryDay: boolean;
  /** Les échéances de tous les jours — triées, sans doublon. */
  readonly everyDeadlines: readonly string[];
  /** Les échéances jour par jour — une liste vide = aucune ce jour-là. */
  readonly dayDeadlines: DraftDayDeadlines;
}

/** Une liste d'échéances par jour (vide = aucune). */
export type DraftDayDeadlines = Readonly<Record<Weekday, readonly string[]>>;

/** Sept jours sans échéance. */
export const BLANK_DAY_DEADLINES: DraftDayDeadlines = {
  mon: [],
  tue: [],
  wed: [],
  thu: [],
  fri: [],
  sat: [],
  sun: [],
};

/** Le brouillon complet d'une adresse de livraison : le lieu, et les consignes. */
export type DeliveryDraft = PostalDraft & DeliverySpecsDraft;

/** Une liste de créneaux par jour (vide = aucun). */
export type DraftDaySlots = Readonly<Record<Weekday, readonly DeliverySlot[]>>;

/** Sept jours sans créneau. */
export const BLANK_DAY_SLOTS: DraftDaySlots = {
  mon: [],
  tue: [],
  wed: [],
  thu: [],
  fri: [],
  sat: [],
  sun: [],
};

/** Consignes vierges — aucune contrainte déclarée, rien d'hérité contredit. */
export const EMPTY_DELIVERY_SPECS: DeliverySpecsDraft = {
  isDefault: false,
  sameEveryDay: true,
  everySlots: [],
  daySlots: BLANK_DAY_SLOTS,
  noContact: false,
  contactPrenom: '',
  contactNom: '',
  contactTel: '',
  signatureRequired: null,
  stopMinutes: null,
  windowMode: null,
  sameDeadlinesEveryDay: true,
  everyDeadlines: [],
  dayDeadlines: BLANK_DAY_DEADLINES,
};

/** Brouillon de livraison vierge. */
export const EMPTY_DELIVERY_DRAFT: DeliveryDraft = {
  ...EMPTY_POSTAL_DRAFT,
  ...EMPTY_DELIVERY_SPECS,
};

/** Préremplit un brouillon depuis une livraison existante (postal + consignes). */
export function deliveryDraftFrom(view: DeliveryAddressView): DeliveryDraft {
  const contact = view.specs.deliveryContact;
  return {
    ...EMPTY_DELIVERY_DRAFT,
    ...postalDraftFrom(view),
    note: view.specs.note,
    gpsLat: view.specs.gps === null ? '' : String(view.specs.gps.lat),
    gpsLng: view.specs.gps === null ? '' : String(view.specs.gps.lng),
    isDefault: view.isDefault,
    ...slotsDraft(view.specs),
    noContact: contact === null,
    contactPrenom: contact?.prenom ?? '',
    contactNom: contact?.nom ?? '',
    contactTel: contact?.telephone ?? '',
    signatureRequired: view.specs.signatureRequired,
    stopMinutes: view.specs.stopMinutes ?? null,
    windowMode: view.specs.windowMode ?? null,
    ...deadlinesDraft(view.specs.deadlines ?? null),
  };
}

function deadlinesDraft(
  deadlines: PreferredDeadlines | null,
): Pick<DeliverySpecsDraft, 'sameDeadlinesEveryDay' | 'everyDeadlines' | 'dayDeadlines'> {
  if (deadlines === null) {
    return { sameDeadlinesEveryDay: true, everyDeadlines: [], dayDeadlines: BLANK_DAY_DEADLINES };
  }
  if (deadlines.mode === 'everyday') {
    return {
      sameDeadlinesEveryDay: true,
      everyDeadlines: deadlines.times,
      dayDeadlines: BLANK_DAY_DEADLINES,
    };
  }
  const byDay = deadlines.byDay;
  return {
    sameDeadlinesEveryDay: false,
    everyDeadlines: [],
    dayDeadlines: {
      mon: byDay.mon ?? [],
      tue: byDay.tue ?? [],
      wed: byDay.wed ?? [],
      thu: byDay.thu ?? [],
      fri: byDay.fri ?? [],
      sat: byDay.sat ?? [],
      sun: byDay.sun ?? [],
    },
  };
}

/**
 * Les créneaux stockés vers le brouillon, lus par `slotsFor` — le seul point
 * de lecture (§14.1). Chaque adresse rangée porte sa liste depuis le
 * 2026-10-07 (`plan-retrait-slots.md`).
 */
function slotsDraft(
  specs: Pick<DeliverySpecs, 'slotList'>,
): Pick<DeliverySpecsDraft, 'sameEveryDay' | 'everySlots' | 'daySlots'> {
  if (specs.slotList.mode === 'everyday') {
    return { sameEveryDay: true, everySlots: slotsFor(specs, null), daySlots: BLANK_DAY_SLOTS };
  }
  return {
    sameEveryDay: false,
    everySlots: [],
    daySlots: {
      mon: slotsFor(specs, 'mon'),
      tue: slotsFor(specs, 'tue'),
      wed: slotsFor(specs, 'wed'),
      thu: slotsFor(specs, 'thu'),
      fri: slotsFor(specs, 'fri'),
      sat: slotsFor(specs, 'sat'),
      sun: slotsFor(specs, 'sun'),
    },
  };
}

/** Vrai créneau : début et fin renseignés, fin après le début. Sinon `null`. */
export function toSlot(start: string, end: string): DeliverySlot | null {
  return start !== '' && end !== '' && start < end ? { start, end } : null;
}

/** Un créneau *invalide* : entamé mais incomplet, ou fin ≤ début. */
export function isBadSlot(start: string, end: string): boolean {
  const touched = start !== '' || end !== '';
  return touched && !(start !== '' && end !== '' && start < end);
}

/** Message d'erreur contact (`''` si valide) : les trois champs, sauf « pas de contact ». */
export function contactIssueOf(draft: DeliverySpecsDraft): string {
  if (draft.noContact) {
    return '';
  }
  const complete =
    draft.contactPrenom.trim() !== '' &&
    draft.contactNom.trim() !== '' &&
    draft.contactTel.trim() !== '';
  return complete ? '' : 'Renseignez prénom, nom et téléphone, ou cochez « pas de contact ».';
}

/**
 * Pas de signature exigée sans contact sur place (Hugo, 2026-09-14) : une
 * signature suppose quelqu'un pour signer. Ne voit que l'exigence EXPLICITE —
 * l'héritée dépend du socle de la société, que {@link withNoContact} traite au
 * moment où l'on coche. Le serveur refuse le même cas (`deliveryAddressPayloadSchema`).
 */
export function signatureIssueOf(draft: DeliverySpecsDraft): string {
  return draft.noContact && draft.signatureRequired === true
    ? 'Une signature ne peut pas être exigée sans contact sur place.'
    : '';
}

/** Les bornes du temps sur place, celles que le carnet tient à l'écriture (L7b-C4). */
export const STOP_MINUTES_MIN = 1;
export const STOP_MINUTES_MAX = 120;

/** Message d'erreur du temps sur place (`''` si valide ou laissé au réglage général). */
export function stopMinutesIssueOf(draft: DeliverySpecsDraft): string {
  const minutes = draft.stopMinutes;
  if (minutes === null) {
    return '';
  }
  return Number.isInteger(minutes) && minutes >= STOP_MINUTES_MIN && minutes <= STOP_MINUTES_MAX
    ? ''
    : `Le temps de livraison sur place va de ${String(STOP_MINUTES_MIN)} à ${String(STOP_MINUTES_MAX)} min — ou se laisse vide.`;
}

/**
 * Coche ou décoche « pas de contact ».
 *
 * Cocher fait tomber une signature exigée — posée sur l'adresse, ou héritée d'une
 * société qui l'exige (`floor`) — à « non exigée » : sans personne sur place, il
 * n'y a personne pour signer. Décocher ne rétablit rien, on ne devine pas ce qui
 * était voulu avant.
 */
export function withNoContact<T extends DeliverySpecsDraft>(
  draft: T,
  noContact: boolean,
  floor: boolean,
): T {
  const signs = (draft.signatureRequired ?? floor) === true;
  return {
    ...draft,
    noContact,
    signatureRequired: noContact && signs ? false : draft.signatureRequired,
  };
}

/**
 * Contrôle de forme d'une livraison : le lieu, puis les consignes.
 *
 * Une facturation n'a pas d'équivalent — elle appelle {@link postalIssue}
 * directement. C'est tout ce que valait l'ancien drapeau `kind`.
 */
export function deliveryIssueOf(draft: DeliveryDraft): string {
  return (
    postalIssue(draft) ||
    contactIssueOf(draft) ||
    signatureIssueOf(draft) ||
    stopMinutesIssueOf(draft) ||
    gpsIssueOf(draft) ||
    ''
  );
}

/** Brouillon → charge de livraison (postal + défaut + consignes). */
export function toDeliveryPayload(draft: DeliveryDraft): DeliveryAddressPayload {
  return {
    ...toBillingPayload(draft),
    isDefault: draft.isDefault,
    specs: {
      // Réglage du site, préremplissage d'une commande — pas une contrainte :
      // le panier peut s'en écarter, et l'écart se voit (provenance figée).
      signatureRequired: draft.signatureRequired,
      note: draft.note.trim(),
      // La liste part TOUJOURS, vide comprise : absente, le serveur garde
      // celle qu'il a (§14.1, l'onglet resté sur l'ancien front), et retirer
      // le dernier créneau n'effacerait rien.
      slotList: buildSlotList(draft),
      deliveryContact: buildContact(draft),
      gps: buildGps(draft),
      // Absent plutôt que `null` : le `jsonb` garde sa forme d'avant pour les
      // adresses qui suivent le réglage général.
      ...(draft.stopMinutes === null ? {} : { stopMinutes: draft.stopMinutes }),
      // Même parti : absent = hérite du réglage général, et le `jsonb` des
      // adresses d'avant CA3 garde sa forme.
      ...(draft.windowMode === null ? {} : { windowMode: draft.windowMode }),
      // Les échéances voyagent même en mode créneau : le carnet réécrit les
      // consignes en bloc, et repasser en créneau ne doit pas les effacer.
      ...withDeadlines(buildDeadlines(draft)),
    },
  };
}

function buildContact(draft: DeliverySpecsDraft): DeliveryContact | null {
  if (draft.noContact) {
    return null;
  }
  return {
    prenom: draft.contactPrenom.trim(),
    nom: draft.contactNom.trim(),
    telephone: draft.contactTel.trim(),
  };
}

function buildGps(draft: PostalDraft): GpsPoint | null {
  const lat = draft.gpsLat.trim();
  const lng = draft.gpsLng.trim();
  if (lat === '' || lng === '') {
    return null;
  }
  return { lat: Number(lat), lng: Number(lng) };
}

function buildSlotList(draft: DeliverySpecsDraft): PreferredSlots {
  if (draft.sameEveryDay) {
    return { mode: 'everyday', slots: [...draft.everySlots] };
  }
  const d = draft.daySlots;
  const day = (slots: readonly DeliverySlot[]): DeliverySlot[] | null =>
    slots.length === 0 ? null : [...slots];
  return {
    mode: 'perDay',
    byDay: {
      mon: day(d.mon),
      tue: day(d.tue),
      wed: day(d.wed),
      thu: day(d.thu),
      fri: day(d.fri),
      sat: day(d.sat),
      sun: day(d.sun),
    },
  };
}

function withDeadlines(deadlines: PreferredDeadlines | null): { deadlines?: PreferredDeadlines } {
  return deadlines === null ? {} : { deadlines };
}

/**
 * Les échéances du brouillon, ou `null` quand il n'y en a aucune — le contrat
 * refuse une liste vide (`deadlineListSchema`, au moins une).
 */
function buildDeadlines(draft: DeliverySpecsDraft): PreferredDeadlines | null {
  if (draft.sameDeadlinesEveryDay) {
    return draft.everyDeadlines.length === 0
      ? null
      : { mode: 'everyday', times: [...draft.everyDeadlines] };
  }
  const d = draft.dayDeadlines;
  const day = (times: readonly string[]): string[] | null =>
    times.length === 0 ? null : [...times];
  const byDay = {
    mon: day(d.mon),
    tue: day(d.tue),
    wed: day(d.wed),
    thu: day(d.thu),
    fri: day(d.fri),
    sat: day(d.sat),
    sun: day(d.sun),
  };
  return Object.values(byDay).every((times) => times === null) ? null : { mode: 'perDay', byDay };
}
