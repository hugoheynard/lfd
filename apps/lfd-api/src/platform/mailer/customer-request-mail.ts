import { sanitiseSubject, type LayoutInput, type RenderedMail } from "@lfd/mailer";

import { DEFAULT_MAIL_LOCALE, fill, mailCopyOf } from "./copy/mail-copy.js";
import type { CustomerRequestCopy } from "./copy/mail-copy.model.js";

/**
 * Les données du courriel d'une **demande client** (`demandes-clients.md`,
 * §3.2). Destinataire : l'adresse du motif ; `Reply-To` : l'auteur — c'est
 * l'appelant qui la pose sur l'envoi, pas le gabarit.
 */
export interface CustomerRequestMailData {
  /** L'id de la demande : le lien vers la boîte du back-office le porte. */
  readonly requestId: string;
  /** Le nom du formulaire (« Nous écrire », « Signaler un problème »). */
  readonly formLabel: string;
  /** Le libellé français du motif. */
  readonly reasonLabel: string;
  /** Seul `urgent` se voit, en tête de l'objet du courriel. */
  readonly urgent: boolean;
  readonly authorName: string;
  readonly authorEmail: string;
  /** Vide quand l'auteur ne l'a pas donné. */
  readonly authorPhone: string;
  /** « Espace pro » ou « Particulier ». */
  readonly originLabel: string;
  /** Vide pour un visiteur. */
  readonly clientLabel: string;
  /** Le numéro de la commande signalée ; vide hors signalement. */
  readonly orderNumber: string;
  /** Combien de photos sont jointes — vues au back-office, jamais en pièce jointe. */
  readonly photoCount: number;
  /** Vide pour un signalement sans mot. */
  readonly message: string;
}

/** La coquille de l'équipe, prêtée par le registre. */
export type StaffShell = (input: Omit<LayoutInput, "brand" | "supportEmail">) => string;

/**
 * Le rendu. Tout texte saisi passe par la coquille, qui l'échappe
 * (`htmlEscape`) ; l'objet du courriel est assaini (`sanitiseSubject`) — un
 * nom avec un retour à la ligne n'injecte pas d'en-tête.
 *
 * Les photos ne partent PAS dans le courriel : une photo d'un colis ou d'un
 * lieu peut identifier, et un courriel ne s'anonymise pas. Le bouton mène à
 * la demande dans la boîte, où elles sont servies sous `b2b_contact:read`.
 */
export function renderCustomerRequestMail(
  data: CustomerRequestMailData,
  shell: StaffShell,
  backOfficeUrl: string,
): RenderedMail {
  const copy = mailCopyOf(DEFAULT_MAIL_LOCALE)["staff.customer-request"];
  const details: readonly (readonly [string, string])[] = [
    [copy.reasonLabel, data.reasonLabel],
    [copy.orderLabel, data.orderNumber],
    [
      copy.photosLabel,
      data.photoCount === 0 ? "" : fill(copy.photosValue, { count: String(data.photoCount) }),
    ],
    [copy.fromLabel, data.authorName],
    [copy.emailLabel, data.authorEmail],
    [copy.phoneLabel, data.authorPhone],
    [copy.originLabel, data.originLabel],
    [copy.clientLabel, data.clientLabel],
  ];
  const lines = details
    .filter(([, value]) => value.trim() !== "")
    .map(([label, value]) => `${label} : ${value}`)
    .join("\n");
  const message = data.message.trim();
  return {
    subject: sanitiseSubject(subjectOf(data, copy)),
    html: shell({
      title: fill(copy.title, { form: data.formLabel }),
      body: message === "" ? lines : `${lines}\n\n« ${message} »`,
      cta: {
        label: copy.cta,
        url: `${backOfficeUrl}/commercial/demandes?demande=${encodeURIComponent(data.requestId)}`,
      },
      footer: copy.footer,
    }),
  };
}

/** L'objet : le formulaire, le motif, la commande s'il y en a une, l'auteur — et l'urgence devant. */
function subjectOf(data: CustomerRequestMailData, copy: CustomerRequestCopy): string {
  const names = { form: data.formLabel, reason: data.reasonLabel, author: data.authorName };
  const subject =
    data.orderNumber === ""
      ? fill(copy.subject, names)
      : fill(copy.subjectWithOrder, { ...names, order: data.orderNumber });
  return data.urgent ? fill(copy.urgentSubject, { subject }) : subject;
}
