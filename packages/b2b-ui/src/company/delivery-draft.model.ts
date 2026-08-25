import type {
  DeliveryAddressPayload,
  DeliveryAddressView,
  DeliveryContact,
  DeliverySlot,
  DeliverySlots,
  GpsPoint,
  SlotByDay,
  Weekday,
} from '@lfd/contracts';

import { WEEKDAYS } from './delivery-format';
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
  readonly sameEveryDay: boolean;
  readonly everyStart: string;
  readonly everyEnd: string;
  readonly days: DraftDays;
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
}

/** Le brouillon complet d'une adresse de livraison : le lieu, et les consignes. */
export type DeliveryDraft = PostalDraft & DeliverySpecsDraft;

/** Brouillon de créneau par jour (chaînes, `''` = vide). */
export interface DraftDay {
  readonly start: string;
  readonly end: string;
}
export type DraftDays = Readonly<Record<Weekday, DraftDay>>;

const BLANK_DAY: DraftDay = { start: '', end: '' };

/** Sept jours vierges. */
export const BLANK_DAYS: DraftDays = {
  mon: BLANK_DAY,
  tue: BLANK_DAY,
  wed: BLANK_DAY,
  thu: BLANK_DAY,
  fri: BLANK_DAY,
  sat: BLANK_DAY,
  sun: BLANK_DAY,
};

/** Consignes vierges — aucune contrainte déclarée, rien d'hérité contredit. */
export const EMPTY_DELIVERY_SPECS: DeliverySpecsDraft = {
  isDefault: false,
  sameEveryDay: true,
  everyStart: '',
  everyEnd: '',
  days: BLANK_DAYS,
  noContact: false,
  contactPrenom: '',
  contactNom: '',
  contactTel: '',
  signatureRequired: null,
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
    ...slotsDraft(view.specs.slots),
    noContact: contact === null,
    contactPrenom: contact?.prenom ?? '',
    contactNom: contact?.nom ?? '',
    contactTel: contact?.telephone ?? '',
    signatureRequired: view.specs.signatureRequired,
  };
}

function slotsDraft(
  slots: DeliverySlots,
): Pick<DeliverySpecsDraft, 'sameEveryDay' | 'everyStart' | 'everyEnd' | 'days'> {
  if (slots.mode === 'everyday') {
    return {
      sameEveryDay: true,
      everyStart: slots.slot?.start ?? '',
      everyEnd: slots.slot?.end ?? '',
      days: BLANK_DAYS,
    };
  }
  return { sameEveryDay: false, everyStart: '', everyEnd: '', days: fromSlotByDay(slots.byDay) };
}

/** Projette les créneaux stockés vers les brouillons de formulaire. */
export function fromSlotByDay(byDay: SlotByDay): DraftDays {
  const draft = (slot: DeliverySlot | null): DraftDay =>
    slot ? { start: slot.start, end: slot.end } : BLANK_DAY;
  return {
    mon: draft(byDay.mon),
    tue: draft(byDay.tue),
    wed: draft(byDay.wed),
    thu: draft(byDay.thu),
    fri: draft(byDay.fri),
    sat: draft(byDay.sat),
    sun: draft(byDay.sun),
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

/** Message d'erreur créneaux (`''` si valide), selon le mode. */
export function slotIssueOf(draft: DeliverySpecsDraft): string {
  if (draft.sameEveryDay) {
    return isBadSlot(draft.everyStart, draft.everyEnd)
      ? 'Renseignez une heure de début ET de fin, la fin après le début.'
      : '';
  }
  return WEEKDAYS.some((w) => isBadSlot(draft.days[w.value].start, draft.days[w.value].end))
    ? 'Chaque créneau renseigné doit avoir un début et une fin valides.'
    : '';
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
 * Contrôle de forme d'une livraison : le lieu, puis les consignes.
 *
 * Une facturation n'a pas d'équivalent — elle appelle {@link postalIssue}
 * directement. C'est tout ce que valait l'ancien drapeau `kind`.
 */
export function deliveryIssueOf(draft: DeliveryDraft): string {
  return (
    postalIssue(draft) || slotIssueOf(draft) || contactIssueOf(draft) || gpsIssueOf(draft) || ''
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
      slots: buildSlots(draft),
      deliveryContact: buildContact(draft),
      gps: buildGps(draft),
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

function buildSlots(draft: DeliverySpecsDraft): DeliverySlots {
  if (draft.sameEveryDay) {
    return { mode: 'everyday', slot: toSlot(draft.everyStart, draft.everyEnd) };
  }
  const d = draft.days;
  const byDay: SlotByDay = {
    mon: toSlot(d.mon.start, d.mon.end),
    tue: toSlot(d.tue.start, d.tue.end),
    wed: toSlot(d.wed.start, d.wed.end),
    thu: toSlot(d.thu.start, d.thu.end),
    fri: toSlot(d.fri.start, d.fri.end),
    sat: toSlot(d.sat.start, d.sat.end),
    sun: toSlot(d.sun.start, d.sun.end),
  };
  return { mode: 'perDay', byDay };
}
