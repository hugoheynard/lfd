import { sanitiseSubject, type LayoutInput, type RenderedMail } from "@lfd/mailer";

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
  const details: readonly (readonly [string, string])[] = [
    ["Motif", data.reasonLabel],
    ["Commande", data.orderNumber],
    ["Photos", data.photoCount === 0 ? "" : `${String(data.photoCount)} — à voir au back-office`],
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
  const message = data.message.trim();
  const reference = data.orderNumber === "" ? "" : ` · ${data.orderNumber}`;
  return {
    subject: sanitiseSubject(
      `${data.urgent ? "[Urgent] " : ""}${data.formLabel} — ${data.reasonLabel}${reference} · ${data.authorName}`,
    ),
    html: shell({
      title: `Une demande est arrivée par « ${data.formLabel} »`,
      body: message === "" ? lines : `${lines}\n\n« ${message} »`,
      cta: {
        label: "Ouvrir la demande",
        url: `${backOfficeUrl}/b2b/demandes?demande=${encodeURIComponent(data.requestId)}`,
      },
      footer:
        "Répondre à ce courriel écrit directement à son auteur. La demande est rangée au back-office, sous E-commerce LFC › Demandes clients.",
    }),
  };
}
