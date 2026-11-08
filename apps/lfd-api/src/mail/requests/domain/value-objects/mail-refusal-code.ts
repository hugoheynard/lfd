/**
 * **La raison FERMÉE d'un refus** (plan
 * `documentation/mail/plan-desinscription-des-e-mails.md`, contradiction :
 * « une raison fermée » ; règle 11) : un e-mail marketing pour une adresse
 * désinscrite (`unsubscribed`) ou sans accord (`no_consent`). Le suivi
 * l'affiche sans lire `failure_reason`, un texte libre qui peut citer
 * l'adresse. Même liste que la contrainte `mail_request_refusal_code_check`.
 */
export const MAIL_REFUSAL_CODES = ["unsubscribed", "no_consent"] as const;

export type MailRefusalCode = (typeof MAIL_REFUSAL_CODES)[number];

/** Le code, ou `null` s'il n'est pas de la liste. */
export function mailRefusalCodeOf(raw: string): MailRefusalCode | null {
  return MAIL_REFUSAL_CODES.find((known) => known === raw) ?? null;
}

/** La phrase rangée dans `failure_reason` pour un refus à raison fermée. */
export const MAIL_REFUSAL_REASONS: Readonly<Record<MailRefusalCode, string>> = {
  unsubscribed: "Non envoyé : l'adresse s'est désinscrite des e-mails marketing de cet espace.",
  no_consent:
    "Non envoyé : l'adresse n'a pas donné son accord aux e-mails marketing de cet espace.",
};
