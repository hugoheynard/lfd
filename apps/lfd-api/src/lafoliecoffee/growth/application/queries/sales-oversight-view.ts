import type {
  SalesOversightFollowerOption,
  SalesOversightFollowerView,
  SalesOversightRowView,
} from "@lfd/contracts";

import type { SubjectMail } from "../../../../mail/channels/deliveries/mail-subject-deliveries.js";
import type { StaffContact } from "../../../../staff/directory/domain/staff-contacts.js";
import type { StaffPermissionHolder } from "../../../../staff/directory/domain/staff-permission-holders.js";
import {
  NO_ACCESS_REQUEST,
  type AccessRequests,
  type SalesSheet,
} from "../../domain/sales-oversight.js";

/** Le modèle de l'e-mail qui ouvre l'accès client d'une identité neuve. */
export const ACCESS_OPENED_TEMPLATE = "customer.access-opened";

/**
 * Les DEMANDES d'envoi de l'accès client : ce que l'équipe a voulu envoyer,
 * qu'il soit parti ou non — c'est le geste de relance qu'on compte.
 */
export function accessRequestsOf(mails: readonly SubjectMail[] | undefined): AccessRequests {
  const requests = (mails ?? []).filter((mail) => mail.template === ACCESS_OPENED_TEMPLATE);
  const [first, ...rest] = requests;
  if (first === undefined) {
    return NO_ACCESS_REQUEST;
  }
  const last = rest.reduce(
    (latest, mail) => (mail.requestedAt > latest ? mail.requestedAt : latest),
    first.requestedAt,
  );
  return { count: requests.length, last };
}

/** « Prénom Nom », ou `null` si la fiche n'en porte pas. */
function nameOf(person: { readonly firstName: string; readonly lastName: string }): string | null {
  const name = `${person.firstName} ${person.lastName}`.trim();
  return name === "" ? null : name;
}

/**
 * Le commercial qui suit : un id que l'annuaire ne connaît plus, ou une fiche
 * suspendue, se lit « archivé » — l'écran dit « ancien membre ».
 */
export function followerViewOf(
  staffId: string | null,
  staff: ReadonlyMap<string, StaffContact>,
): SalesOversightFollowerView | null {
  if (staffId === null) {
    return null;
  }
  const person = staff.get(staffId);
  if (person === undefined) {
    return { id: staffId, name: null, archived: true };
  }
  return { id: staffId, name: nameOf(person), archived: !person.active };
}

/** Les commerciaux du filtre : actifs, par nom. */
export function followerOptionsOf(
  ids: readonly string[],
  staff: ReadonlyMap<string, StaffContact>,
): SalesOversightFollowerOption[] {
  return ids
    .flatMap((id) => {
      const person = staff.get(id);
      return person === undefined || !person.active ? [] : [{ id, name: nameOf(person) }];
    })
    .sort((left, right) => (left.name ?? "").localeCompare(right.name ?? "", "fr"));
}

/** À qui confier une fiche : les tenants du droit, déjà non suspendus, par nom. */
export function assignableOptionsOf(
  holders: readonly StaffPermissionHolder[],
): SalesOversightFollowerOption[] {
  return holders
    .map((holder) => ({ id: holder.staffUserId, name: nameOf(holder) }))
    .sort((left, right) => (left.name ?? "").localeCompare(right.name ?? "", "fr"));
}

/** Une ligne du tableau — sans aucune coordonnée du prospect. */
export function rowViewOf(
  sheet: SalesSheet,
  staff: ReadonlyMap<string, StaffContact>,
): SalesOversightRowView {
  const { facts } = sheet;
  return {
    companyId: facts.companyId,
    reference: facts.reference,
    name: facts.name,
    level: sheet.level,
    missing: sheet.missing,
    ageDays: sheet.ageDays,
    followedBy: followerViewOf(facts.followedByStaffId, staff),
    declaredVia: facts.declaredVia,
    signals: sheet.signals,
    accessSentCount: sheet.access.count,
    lastAccessSentAt: sheet.access.last?.toISOString() ?? null,
    deliveryAddressCount: facts.work.deliveryAddressCount,
    steps: sheet.steps,
    nextStep: sheet.nextStep,
    nextStepActor: sheet.nextStepActor,
  };
}
