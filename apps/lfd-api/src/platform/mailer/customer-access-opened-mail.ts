import { sanitiseSubject, type RenderedMail } from "@lfd/mailer";

import { DEFAULT_MAIL_LOCALE, fill, fillNamed, mailCopyOf } from "./copy/mail-copy.js";
import type { CustomerShell } from "./delivery-en-route-mail.js";

/**
 * Les données du courriel **« Votre accès à l'espace pro »** — l'invitation
 * d'un client par le staff. Destinataire : la personne invitée.
 */
export interface CustomerAccessOpenedMailData {
  readonly firstName: string;
  readonly companyName: string;
  /** L'adresse invitée — celle avec laquelle se connecter. */
  readonly email: string;
  /**
   * `/connexion/code` de la boutique, ou `null` quand la racine publique du
   * client n'est pas configurée : l'e-mail retombe alors sur le seul lien de
   * mot de passe, comme avant le 2026-10-09.
   */
  readonly signInUrl: string | null;
  /** Le lien à usage unique, à durée de vie limitée. */
  readonly passwordSetupUrl: string;
}

/**
 * Le rendu. 🔴 **Le code e-mail d'abord** (Hugo, 2026-10-09) : l'invitation
 * disait « choisissez votre mot de passe » ; elle dit désormais « connectez-vous
 * avec votre adresse, vous recevrez un code », et le mot de passe devient un
 * lien secondaire tant que le ticket est émis.
 *
 * Le bouton ne porte PAS l'adresse : `/connexion/code` part chez Auth0 sans
 * `login_hint`, pour ne pas semer l'adresse dans une URL. Elle est écrite dans
 * le corps, d'où la personne la recopie.
 *
 * L'invité qui entre par code n'obtient pas un second compte : sa première
 * entrée rattache le compte de l'invitation (`unknown-subject-admission.ts`).
 * Les invitations déjà envoyées ne changent pas.
 */
export function renderCustomerAccessOpenedMail(
  data: CustomerAccessOpenedMailData,
  shell: CustomerShell,
): RenderedMail {
  const copy = mailCopyOf(DEFAULT_MAIL_LOCALE)["customer.access-opened"];
  const company = { company: data.companyName };
  const opened = fill(copy.opened, company);
  const title = fillNamed(copy.title, copy.titleWithoutName, data.firstName);
  const subject = sanitiseSubject(fill(copy.subject, company));
  if (data.signInUrl === null) {
    return {
      subject,
      html: shell({
        title,
        body: `${opened}\n\n${copy.choosePassword}`,
        cta: { label: copy.choosePasswordCta, url: data.passwordSetupUrl },
        footer: copy.footer,
      }),
    };
  }
  return {
    subject,
    html: shell({
      title,
      body: `${opened}\n\n${fill(copy.signInWithCode, { email: data.email })}`,
      cta: { label: copy.signInCta, url: data.signInUrl },
      secondaryLink: { label: copy.passwordLink, url: data.passwordSetupUrl },
      footer: copy.footer,
    }),
  };
}
