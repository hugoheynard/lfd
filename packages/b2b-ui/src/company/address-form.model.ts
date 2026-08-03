import type {
  BillingAddressPayload,
  BillingAddressView,
  DeliveryAddressPayload,
  DeliveryAddressView,
  DeliveryContact,
  DeliverySlot,
  DeliverySlots,
  GpsPoint,
  SlotByDay,
  Weekday,
} from "@lfd/contracts";

import { WEEKDAYS } from "./delivery-format";

/**
 * Brouillon de saisie d'une **adresse** (facturation ou livraison), partagé par
 * les panneaux d'adresse des deux frontends B2B. Tout est chaîne (`''` = vide) —
 * la validité réelle (bornes, cohérence) est contrôlée ici *de forme* ; le
 * backend garde le dernier mot. Les champs de livraison sont ignorés pour une
 * facturation.
 */
export interface AddressDraft {
  // Champs postaux (communs).
  readonly label: string;
  readonly ligne1: string;
  readonly ligne2: string;
  readonly codePostal: string;
  readonly ville: string;
  readonly pays: string;
  // Livraison uniquement.
  readonly isDefault: boolean;
  readonly note: string;
  readonly sameEveryDay: boolean;
  readonly everyStart: string;
  readonly everyEnd: string;
  readonly days: DraftDays;
  readonly noContact: boolean;
  readonly contactPrenom: string;
  readonly contactNom: string;
  readonly contactTel: string;
  readonly gpsLat: string;
  readonly gpsLng: string;
}

/** Brouillon de créneau par jour (chaînes, `''` = vide). */
export interface DraftDay {
  readonly start: string;
  readonly end: string;
}
export type DraftDays = Readonly<Record<Weekday, DraftDay>>;

const BLANK_DAY: DraftDay = { start: "", end: "" };

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

/** Brouillon vide (adresse neuve). `pays` prérempli, cas courant. */
export const EMPTY_ADDRESS_DRAFT: AddressDraft = {
  label: "",
  ligne1: "",
  ligne2: "",
  codePostal: "",
  ville: "",
  pays: "France",
  isDefault: false,
  note: "",
  sameEveryDay: true,
  everyStart: "",
  everyEnd: "",
  days: BLANK_DAYS,
  noContact: false,
  contactPrenom: "",
  contactNom: "",
  contactTel: "",
  gpsLat: "",
  gpsLng: "",
};

/** Préremplit un brouillon depuis une facturation existante (champs postaux). */
export function billingDraftFrom(view: BillingAddressView): AddressDraft {
  return { ...EMPTY_ADDRESS_DRAFT, ...postalOf(view) };
}

/** Préremplit un brouillon depuis une livraison existante (postal + consignes). */
export function deliveryDraftFrom(view: DeliveryAddressView): AddressDraft {
  const contact = view.specs.deliveryContact;
  return {
    ...EMPTY_ADDRESS_DRAFT,
    ...postalOf(view),
    isDefault: view.isDefault,
    note: view.specs.note,
    ...slotsDraft(view.specs.slots),
    noContact: contact === null,
    contactPrenom: contact?.prenom ?? "",
    contactNom: contact?.nom ?? "",
    contactTel: contact?.telephone ?? "",
    gpsLat: view.specs.gps === null ? "" : String(view.specs.gps.lat),
    gpsLng: view.specs.gps === null ? "" : String(view.specs.gps.lng),
  };
}

function postalOf(
  view: BillingAddressView,
): Pick<AddressDraft, "label" | "ligne1" | "ligne2" | "codePostal" | "ville" | "pays"> {
  return {
    label: view.label,
    ligne1: view.ligne1,
    ligne2: view.ligne2,
    codePostal: view.codePostal,
    ville: view.ville,
    pays: view.pays,
  };
}

function slotsDraft(
  slots: DeliverySlots,
): Pick<AddressDraft, "sameEveryDay" | "everyStart" | "everyEnd" | "days"> {
  if (slots.mode === "everyday") {
    return {
      sameEveryDay: true,
      everyStart: slots.slot?.start ?? "",
      everyEnd: slots.slot?.end ?? "",
      days: BLANK_DAYS,
    };
  }
  return { sameEveryDay: false, everyStart: "", everyEnd: "", days: fromSlotByDay(slots.byDay) };
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
  return start !== "" && end !== "" && start < end ? { start, end } : null;
}

/** Un créneau *invalide* : entamé mais incomplet, ou fin ≤ début. */
export function isBadSlot(start: string, end: string): boolean {
  const touched = start !== "" || end !== "";
  return touched && !(start !== "" && end !== "" && start < end);
}

/** Message d'erreur créneaux (`''` si valide), selon le mode. */
export function slotIssueOf(draft: AddressDraft): string {
  if (draft.sameEveryDay) {
    return isBadSlot(draft.everyStart, draft.everyEnd)
      ? "Renseignez une heure de début ET de fin, la fin après le début."
      : "";
  }
  return WEEKDAYS.some((w) => isBadSlot(draft.days[w.value].start, draft.days[w.value].end))
    ? "Chaque créneau renseigné doit avoir un début et une fin valides."
    : "";
}

/** Message d'erreur contact (`''` si valide) : les trois champs, sauf « pas de contact ». */
export function contactIssueOf(draft: AddressDraft): string {
  if (draft.noContact) {
    return "";
  }
  const complete =
    draft.contactPrenom.trim() !== "" &&
    draft.contactNom.trim() !== "" &&
    draft.contactTel.trim() !== "";
  return complete ? "" : "Renseignez prénom, nom et téléphone, ou cochez « pas de contact ».";
}

/** Message d'erreur GPS (`''` si valide) : deux coordonnées, ou aucune, en bornes. */
export function gpsIssueOf(draft: AddressDraft): string {
  const lat = draft.gpsLat.trim();
  const lng = draft.gpsLng.trim();
  if (lat === "" && lng === "") {
    return "";
  }
  if (lat === "" || lng === "") {
    return "Renseignez la latitude ET la longitude, ou laissez les deux vides.";
  }
  const nlat = Number(lat);
  const nlng = Number(lng);
  const inRange =
    Number.isFinite(nlat) && Number.isFinite(nlng) && Math.abs(nlat) <= 90 && Math.abs(nlng) <= 180;
  return inRange ? "" : "Coordonnées hors limites (latitude ±90, longitude ±180).";
}

/** Contrôle de forme : postal requis, plus les consignes pour une livraison. */
export function isAddressValid(draft: AddressDraft, kind: "facturation" | "livraison"): boolean {
  const postalOk =
    draft.ligne1.trim() !== "" && draft.codePostal.trim() !== "" && draft.ville.trim() !== "";
  if (kind === "facturation") {
    return postalOk;
  }
  return (
    postalOk &&
    slotIssueOf(draft) === "" &&
    contactIssueOf(draft) === "" &&
    gpsIssueOf(draft) === ""
  );
}

/** Champs postaux → charge de facturation. */
export function toBillingPayload(draft: AddressDraft): BillingAddressPayload {
  return {
    label: draft.label.trim(),
    ligne1: draft.ligne1.trim(),
    ligne2: draft.ligne2.trim(),
    codePostal: draft.codePostal.trim(),
    ville: draft.ville.trim(),
    pays: draft.pays.trim(),
  };
}

/** Brouillon → charge de livraison (postal + défaut + consignes). */
export function toDeliveryPayload(draft: AddressDraft): DeliveryAddressPayload {
  return {
    ...toBillingPayload(draft),
    isDefault: draft.isDefault,
    specs: {
      note: draft.note.trim(),
      slots: buildSlots(draft),
      deliveryContact: buildContact(draft),
      gps: buildGps(draft),
    },
  };
}

function buildContact(draft: AddressDraft): DeliveryContact | null {
  if (draft.noContact) {
    return null;
  }
  return {
    prenom: draft.contactPrenom.trim(),
    nom: draft.contactNom.trim(),
    telephone: draft.contactTel.trim(),
  };
}

function buildGps(draft: AddressDraft): GpsPoint | null {
  const lat = draft.gpsLat.trim();
  const lng = draft.gpsLng.trim();
  if (lat === "" || lng === "") {
    return null;
  }
  return { lat: Number(lat), lng: Number(lng) };
}

function buildSlots(draft: AddressDraft): DeliverySlots {
  if (draft.sameEveryDay) {
    return { mode: "everyday", slot: toSlot(draft.everyStart, draft.everyEnd) };
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
  return { mode: "perDay", byDay };
}
