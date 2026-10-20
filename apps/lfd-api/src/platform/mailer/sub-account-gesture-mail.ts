import { sanitiseSubject, type LayoutRow, type RenderedMail } from "@lfd/mailer";

import type { SubAccountActivityShell } from "./sub-account-activity-mail.js";

/**
 * Le geste d'un site hors du cycle d'une commande (plan
 * `documentation/comptes-client/plan-notifications-sous-comptes.md`, N4).
 * Chaque lot de N4 ajoute SON membre, avec ses deux phrases : une union, pas
 * un champ libre, pour qu'un geste sans phrase ne compile pas.
 */
export type SubAccountGesture = "problem_reported";

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

const VERB: Readonly<Record<SubAccountGesture, string>> = {
  problem_reported: "a signalé un problème sur la commande",
};

const TITLE: Readonly<Record<SubAccountGesture, string>> = {
  problem_reported: "Problème signalé par un de vos sites",
};

const REFERENCE_LABEL: Readonly<Record<SubAccountGesture, string>> = {
  problem_reported: "Commande",
};

/** Le rendu, français seul, comme `customer.sub-account-activity`. */
export function renderSubAccountGestureMail(
  data: SubAccountGestureMailData,
  shell: SubAccountActivityShell,
): RenderedMail {
  const reference = data.reference === null ? "" : ` (${data.reference})`;
  return {
    subject: sanitiseSubject(`${data.siteName} — ${TITLE[data.gesture]}${reference}`),
    html: shell({
      title: TITLE[data.gesture],
      body: bodyOf(data),
      rows: rowsOf(data),
      footer:
        "Vous recevez ce message parce que ce site est rattaché à votre compte. " +
        "Pour ne plus le recevoir, écrivez-nous : nous réglons ces avis rôle par rôle.",
    }),
  };
}

function bodyOf(data: SubAccountGestureMailData): string {
  const reference = data.reference === null ? "" : ` ${data.reference}`;
  const team = data.byTeam ? " (fait par notre équipe)" : "";
  return `Votre site ${data.siteName} ${VERB[data.gesture]}${reference}${team}.`;
}

function rowsOf(data: SubAccountGestureMailData): readonly LayoutRow[] {
  return [
    { label: "Site", value: data.siteName },
    ...(data.reference === null
      ? []
      : [{ label: REFERENCE_LABEL[data.gesture], value: data.reference }]),
  ];
}
