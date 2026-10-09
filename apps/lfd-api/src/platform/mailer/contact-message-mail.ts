import { sanitiseSubject, type LayoutInput, type RenderedMail } from "@lfd/mailer";

/**
 * Les données du courriel **« Nous écrire »** (`plan-nous-ecrire.md`, §2.2).
 * Destinataire : l'adresse de l'objet choisi ; `Reply-To` : l'auteur — c'est
 * l'appelant qui la pose sur l'envoi, pas le gabarit.
 */
export interface ContactMessageMailData {
  /** Le libellé français de l'objet. */
  readonly subjectLabel: string;
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
  readonly message: string;
}

/** La coquille de l'équipe, prêtée par le registre. */
export type StaffShell = (input: Omit<LayoutInput, "brand" | "supportEmail">) => string;

/**
 * Le rendu. Tout texte saisi par le visiteur passe par la coquille, qui
 * l'échappe (`htmlEscape`) ; l'objet du courriel est assaini
 * (`sanitiseSubject`) — un nom avec un retour à la ligne n'injecte pas
 * d'en-tête.
 */
export function renderContactMessageMail(
  data: ContactMessageMailData,
  shell: StaffShell,
): RenderedMail {
  const details: readonly (readonly [string, string])[] = [
    ["Objet", data.subjectLabel],
    ["De", data.authorName],
    ["E-mail", data.authorEmail],
    ["Téléphone", data.authorPhone],
    ["Depuis", data.originLabel],
    ["Client", data.clientLabel],
  ];
  const lines = details
    .filter(([, value]) => value.trim() !== "")
    .map(([label, value]) => `${label} : ${value}`)
    .join("\n");
  return {
    subject: sanitiseSubject(
      `${data.urgent ? "[Urgent] " : ""}Nous écrire — ${data.subjectLabel} · ${data.authorName}`,
    ),
    html: shell({
      title: "Un message est arrivé par « Nous écrire »",
      body: `${lines}\n\n« ${data.message.trim()} »`,
      footer:
        "Répondre à ce courriel écrit directement à son auteur. Le message est aussi rangé au back-office, sous E-commerce LFC › Contact › Messages.",
    }),
  };
}
