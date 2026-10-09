import { sanitiseSubject, type RenderedMail } from "@lfd/mailer";

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

const FOOTER =
  "Vous n'attendiez pas cet e-mail ? Ignorez-le : tant que personne ne se connecte " +
  "avec cette adresse, l'accès reste inutilisé.";

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
  const opened =
    `Un accès à l'espace professionnel de ${data.companyName} vient d'être ouvert à votre nom ` +
    "par l'équipe La Folie Coffee.";
  const title = `Bienvenue${data.firstName === "" ? "" : `, ${data.firstName}`}`;
  const subject = sanitiseSubject(`Votre accès à l'espace pro ${data.companyName}`);
  if (data.signInUrl === null) {
    return {
      subject,
      html: shell({
        title,
        body:
          `${opened}\n\n` +
          "Il ne reste qu'à choisir votre mot de passe. Le lien ci-dessous est valable 7 jours ; " +
          "passé ce délai, demandez-nous simplement de vous en renvoyer un.",
        cta: { label: "Choisir mon mot de passe", url: data.passwordSetupUrl },
        footer: FOOTER,
      }),
    };
  }
  return {
    subject,
    html: shell({
      title,
      body:
        `${opened}\n\n` +
        `Connectez-vous avec votre adresse ${data.email} : vous recevrez un code par e-mail, ` +
        "à taper sur l'écran de connexion. Aucun mot de passe à retenir.",
      cta: { label: "Me connecter", url: data.signInUrl },
      secondaryLink: {
        label: "Ou choisissez un mot de passe (lien valable 7 jours)",
        url: data.passwordSetupUrl,
      },
      footer: FOOTER,
    }),
  };
}
