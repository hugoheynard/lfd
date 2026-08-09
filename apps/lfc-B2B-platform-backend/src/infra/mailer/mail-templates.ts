import { renderLayout, sanitiseSubject, type TemplateRegistry } from "@lfd/mailer";

/**
 * Les **e-mails de la plateforme B2B** — la carte et le registre que
 * `@lfd/mailer` prend en paramètre.
 *
 * Le paquet ignore tout de ce vocabulaire : il fournit le transport et la
 * coquille, l'app décide de ce qu'elle dit. Ajouter un e-mail, c'est ajouter une
 * ligne à la carte — le registre étant un `Record` sur ses clés, oublier le
 * rendu **ne compile pas**.
 *
 * Deux e-mails pour commencer, tous deux **internes** : ce sont les deux
 * endroits où l'équipe apprenait jusqu'ici qu'il s'était passé quelque chose en
 * ouvrant le back-office. Les accusés de réception au client viendront ensuite —
 * ils supposent une adresse d'expédition vérifiée chez le fournisseur.
 */
export interface B2bMails {
  /** Un client a réservé un créneau. Destinataire : la boîte de l'équipe. */
  "staff.appointment-booked": {
    readonly contactName: string;
    /** Jour et heure déjà mis en forme, en heure de Paris — le mail ne recalcule rien. */
    readonly when: string;
    readonly purposeLabel: string;
    readonly channelLabel: string;
    readonly message: string;
    /** Lien direct vers la page du rendez-vous dans le back-office. */
    readonly appointmentUrl: string;
  };
  /** Un client demande à être rappelé ou écrit. Destinataire : la boîte de l'équipe. */
  "staff.support-requested": {
    readonly contactName: string;
    readonly purposeLabel: string;
    /** « Rappel au plus vite », « Mardi matin », « Par e-mail »… */
    readonly availability: string;
    readonly phoneNumber: string;
    readonly message: string;
  };
}

/** Le corps d'un e-mail interne : des lignes « Libellé : valeur », puis le message. */
function detailsBody(details: readonly (readonly [string, string])[], message: string): string {
  const lines = details
    .filter(([, value]) => value.trim() !== "")
    .map(([label, value]) => `${label} : ${value}`);
  const trimmed = message.trim();
  return trimmed === "" ? lines.join("\n") : `${lines.join("\n")}\n\n« ${trimmed} »`;
}

export const B2B_MAIL_TEMPLATES: TemplateRegistry<B2bMails> = {
  "staff.appointment-booked": (data) => ({
    subject: sanitiseSubject(`Nouveau rendez-vous — ${data.contactName} · ${data.when}`),
    html: renderLayout({
      title: "Un rendez-vous vient d'être pris",
      body: detailsBody(
        [
          ["Contact", data.contactName],
          ["Quand", data.when],
          ["Motif", data.purposeLabel],
          ["Canal", data.channelLabel],
        ],
        data.message,
      ),
      cta: { label: "Ouvrir le rendez-vous", url: data.appointmentUrl },
      footer: "Alerte interne LFC — envoyée à l'équipe commerciale.",
    }),
  }),

  "staff.support-requested": (data) => ({
    subject: sanitiseSubject(`Demande de contact — ${data.contactName} · ${data.purposeLabel}`),
    html: renderLayout({
      title: "Un client demande à être contacté",
      body: detailsBody(
        [
          ["Contact", data.contactName],
          ["Motif", data.purposeLabel],
          ["Disponibilité", data.availability],
          ["Téléphone", data.phoneNumber],
        ],
        data.message,
      ),
      footer: "Alerte interne LFC — envoyée à l'équipe commerciale.",
    }),
  }),
};
