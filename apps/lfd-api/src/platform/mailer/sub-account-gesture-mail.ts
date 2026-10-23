import { sanitiseSubject, type LayoutRow, type RenderedMail } from "@lfd/mailer";

import { DEFAULT_MAIL_LOCALE, fill, mailCopyOf } from "./copy/mail-copy.js";
import type { SubAccountGestureCopy, SubAccountGestureKind } from "./copy/mail-copy.model.js";
import type { SubAccountActivityShell } from "./sub-account-activity-mail.js";

/**
 * Le geste d'un site hors du cycle d'une commande (plan
 * `documentation/comptes-client/plan-notifications-sous-comptes.md`, N4).
 * Chaque lot de N4 ajoute SON membre, avec ses deux phrases : une union, pas
 * un champ libre, pour qu'un geste sans phrase ne compile pas.
 */
export type SubAccountGesture = SubAccountGestureKind;

/**
 * Les données de l'avis **« un de vos sites a… »** pour un geste qui n'est
 * pas une passation, une annulation ni un paiement (N4). Second gabarit,
 * plutôt qu'un `orderNumber` rendu facultatif dans le premier : le mail de
 * commande garde son contrat.
 *
 * Il ne nomme que le SITE (Q4) — jamais la personne — et ne dit du geste que
 * son nom : ni contenu d'un signalement, ni coordonnée.
 */
export interface SubAccountGestureMailData {
  readonly gesture: SubAccountGesture;
  /** Le nom d'usage du site — l'enseigne, à défaut la raison sociale. */
  readonly siteName: string;
  /** Ce sur quoi porte le geste quand il en a un (le numéro de commande), sinon `null`. */
  readonly reference: string | null;
  /** Le geste a été fait par l'équipe au nom du site (décision de Hugo, 2026-10-20). */
  readonly byTeam: boolean;
}

/** Le rendu, langue de repli seule, comme `customer.sub-account-activity`. */
export function renderSubAccountGestureMail(
  data: SubAccountGestureMailData,
  shell: SubAccountActivityShell,
): RenderedMail {
  const copy = mailCopyOf(DEFAULT_MAIL_LOCALE)["customer.sub-account-gesture"];
  const title = copy.title[data.gesture];
  const site = data.siteName;
  return {
    subject: sanitiseSubject(
      data.reference === null
        ? fill(copy.subject, { site, title })
        : fill(copy.subjectWithReference, { site, title, reference: data.reference }),
    ),
    html: shell({
      title,
      body: bodyOf(data, copy),
      rows: rowsOf(data, copy),
      footer: copy.footer,
    }),
  };
}

function bodyOf(data: SubAccountGestureMailData, copy: SubAccountGestureCopy): string {
  const values = { site: data.siteName, action: copy.action[data.gesture] };
  if (data.reference === null) {
    return fill(data.byTeam ? copy.bodyByTeam : copy.body, values);
  }
  const frame = data.byTeam ? copy.bodyWithReferenceByTeam : copy.bodyWithReference;
  return fill(frame, { ...values, reference: data.reference });
}

function rowsOf(
  data: SubAccountGestureMailData,
  copy: SubAccountGestureCopy,
): readonly LayoutRow[] {
  return [
    { label: copy.siteLabel, value: data.siteName },
    ...(data.reference === null
      ? []
      : [
          {
            label: copy.referenceLabelOf[data.gesture] ?? copy.referenceLabel,
            value: data.reference,
          },
        ]),
  ];
}
