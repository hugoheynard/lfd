import { sanitiseSubject, type LayoutInput, type LayoutRow, type RenderedMail } from "@lfd/mailer";

import { DEFAULT_MAIL_LOCALE, fill, mailCopyOf } from "./copy/mail-copy.js";
import type { SubAccountActivityCopy, SubAccountActivityKind } from "./copy/mail-copy.model.js";

/**
 * Ce que le site a fait — un mot par ligne du courriel, pas par clé du
 * tableau : « annulée » et « abandonnée » partagent la clé `order_cancelled`
 * (`plan-notifications-sous-comptes.md`, §1) mais ne se disent pas pareil.
 */
export type SubAccountActivity = SubAccountActivityKind;

/**
 * Les données de l'avis **« un de vos sites a… »** (plan
 * `documentation/comptes-client/plan-notifications-sous-comptes.md`, N2).
 * Destinataire : un membre accepté du PRINCIPAL, au rôle coché.
 *
 * Il ne nomme que le SITE (Q4) : ni le nom, ni l'adresse, ni le rôle de la
 * personne qui a agi. Il ne porte aucun lien : le principal n'entre pas dans
 * l'espace de ses sous-comptes (S6 non bâti).
 */
export interface SubAccountActivityMailData {
  readonly activity: SubAccountActivity;
  /** Le nom d'usage du site — l'enseigne, à défaut la raison sociale. */
  readonly siteName: string;
  readonly orderNumber: string;
  /** Centimes TTC, ou `null` : le site ne suivait ni `billing` ni `pricing` à la passation (Q1). */
  readonly totalCents: number | null;
  /** Le jour demandé (`YYYY-MM-DD`), ou `null`. */
  readonly requestedFor: string | null;
  /** La commande a été saisie par l'équipe au nom du site. */
  readonly enteredByTeam: boolean;
}

/** La coquille client, prêtée par le registre. */
export type SubAccountActivityShell = (
  input: Omit<LayoutInput, "brand" | "supportEmail">,
) => string;

/**
 * Le rendu. Langue de repli seule : aucune langue n'est encore choisie pour
 * un client. Les mots viennent du dictionnaire (`customer.sub-account-activity`).
 */
export function renderSubAccountActivityMail(
  data: SubAccountActivityMailData,
  shell: SubAccountActivityShell,
): RenderedMail {
  const copy = mailCopyOf(DEFAULT_MAIL_LOCALE)["customer.sub-account-activity"];
  const title = copy.title[data.activity];
  return {
    subject: sanitiseSubject(
      fill(copy.subject, { site: data.siteName, title, order: data.orderNumber }),
    ),
    html: shell({
      title,
      body: fill(data.enteredByTeam ? copy.bodyEnteredByTeam : copy.body, {
        site: data.siteName,
        action: copy.action[data.activity],
        order: data.orderNumber,
      }),
      rows: rowsOf(data, copy),
      footer: copy.footer,
    }),
  };
}

function rowsOf(
  data: SubAccountActivityMailData,
  copy: SubAccountActivityCopy,
): readonly LayoutRow[] {
  const day = dayInWords(data.requestedFor);
  return [
    { label: copy.siteLabel, value: data.siteName },
    { label: copy.orderLabel, value: data.orderNumber },
    ...(day === null ? [] : [{ label: copy.dayLabel, value: day }]),
    ...(data.totalCents === null
      ? []
      : [{ label: copy.totalLabel, value: euros(data.totalCents), strong: true }]),
  ];
}

function euros(cents: number): string {
  return new Intl.NumberFormat("fr", { style: "currency", currency: "EUR" }).format(cents / 100);
}

/** « mardi 13 octobre » — lu en UTC : un jour de service n'a pas de fuseau. */
function dayInWords(requestedFor: string | null): string | null {
  if (requestedFor === null) {
    return null;
  }
  const date = new Date(`${requestedFor.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat("fr", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(date);
}
