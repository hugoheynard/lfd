import type { MailSendSubjectView } from '@lfd/contracts';

/**
 * **Les types de sujet, dits en français** (`plan-sujet-des-e-mails.md`,
 * règle 1 : la liste fermée du bloc `mail`, relue dans le contrat le
 * 2026-11-08). Un type que l'écran ne connaît pas s'affiche tel quel.
 */
const SUBJECT_TYPE_LABELS: Readonly<Record<string, string>> = {
  order: 'Commande',
  account: 'Compte',
  company: 'Société',
  invoice: 'Facture',
  collection_batch: 'Lot de prélèvement',
  mandate: 'Mandat',
  customer_request: 'Demande client',
  staff_member: 'Membre de l’équipe',
  production_day: 'Journée de production',
  appointment: 'Rendez-vous',
};

/** Les identifiants sont des ULID préfixés : les huit derniers signes suffisent à l'œil. */
const SHORT_ID_LENGTH = 8;

/** Ce que l'écran fait d'un sujet : un lien vers la commande, ou un texte. */
export type MailSubjectDisplay =
  | { readonly kind: 'link'; readonly label: string; readonly path: readonly string[] }
  | { readonly kind: 'text'; readonly label: string };

/**
 * **Un sujet d'e-mail à l'écran** (règle 9) : une commande devient un lien
 * vers sa fiche ; les autres types se lisent en texte, type traduit et
 * identifiant court.
 */
export function mailSubjectDisplay(subject: MailSendSubjectView): MailSubjectDisplay {
  if (subject.type === 'order') {
    return { kind: 'link', label: 'Commande', path: ['/commandes', subject.id] };
  }
  const type = SUBJECT_TYPE_LABELS[subject.type] ?? subject.type;
  return { kind: 'text', label: `${type} ${shortId(subject.id)}` };
}

function shortId(id: string): string {
  return id.length <= SHORT_ID_LENGTH ? id : `…${id.slice(-SHORT_ID_LENGTH)}`;
}
