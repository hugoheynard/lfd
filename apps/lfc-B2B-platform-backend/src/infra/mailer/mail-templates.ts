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
  /**
   * Une alerte s'est déclenchée sur un compte. Destinataire : la boîte de
   * l'équipe.
   *
   * Le corps porte les **constats figés**, pas de quoi les recalculer : un
   * e-mail est une photo, et la moyenne d'aujourd'hui ne doit pas réécrire ce
   * qu'on a constaté hier.
   */
  "staff.account-alert": {
    readonly companyName: string;
    readonly ruleLabel: string;
    readonly orderNumber: string;
    /** Un constat par ligne concernée, déjà mis en forme. */
    readonly findings: readonly string[];
    /** Lien direct vers l'onglet Alertes du compte. */
    readonly accountUrl: string;
  };
  /**
   * Un accès à l'espace vient d'être ouvert. Destinataire : **le client**.
   *
   * Le premier e-mail de cette carte qui ne s'adresse pas à l'équipe — et le
   * seul endroit du système où le lien de création de mot de passe a le droit
   * d'apparaître. Ce lien vaut prise de contrôle du compte : sa seule
   * destination légitime est la boîte de la personne concernée.
   */
  "customer.access-opened": {
    readonly firstName: string;
    readonly companyName: string;
    /** Le lien à usage unique, à durée de vie limitée. */
    readonly passwordSetupUrl: string;
  };
  /**
   * Une société de plus est apparue dans un espace existant. Destinataire : **le
   * client**.
   *
   * Pas de lien de mot de passe ici : la personne en a déjà un. Ce qu'elle doit
   * apprendre, c'est qu'un second établissement s'est ajouté à son espace — sans
   * quoi elle le découvrirait par surprise à sa prochaine commande.
   */
  "customer.company-attached": {
    readonly firstName: string;
    readonly companyName: string;
  };
  /**
   * Un accès au **back-office** vient d'être ouvert. Destinataire : **le membre
   * de l'équipe**.
   *
   * Le second endroit du système — avec `customer.access-opened` — où un lien de
   * mot de passe a le droit d'apparaître, et pour la même raison : sa seule
   * destination légitime est la boîte de la personne concernée. Qui lit ce lien
   * devient elle.
   */
  "staff.invited": {
    readonly firstName: string;
    /** Le lien à usage unique, à durée de vie limitée. */
    readonly passwordSetupUrl: string;
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
  "staff.account-alert": (data) => ({
    subject: sanitiseSubject(`Alerte — ${data.companyName} · ${data.ruleLabel}`),
    html: renderLayout({
      title: `${data.ruleLabel} sur ${data.companyName}`,
      body: detailsBody(
        [
          ["Compte", data.companyName],
          ["Commande", data.orderNumber],
        ],
        data.findings.join("\n"),
      ),
      cta: { label: "Ouvrir le compte", url: data.accountUrl },
    }),
  }),
  "customer.access-opened": (data) => ({
    subject: sanitiseSubject(`Votre accès à l'espace pro ${data.companyName}`),
    html: renderLayout({
      title: `Bienvenue${data.firstName === "" ? "" : `, ${data.firstName}`}`,
      body:
        `Un accès à l'espace professionnel de ${data.companyName} vient d'être ouvert à votre nom ` +
        "par l'équipe La Folie Douce.\n\n" +
        "Il ne reste qu'à choisir votre mot de passe. Le lien ci-dessous est valable 7 jours ; " +
        "passé ce délai, demandez-nous simplement de vous en renvoyer un.",
      cta: { label: "Choisir mon mot de passe", url: data.passwordSetupUrl },
      footer:
        "Vous n'attendiez pas cet e-mail ? Ignorez-le : sans mot de passe choisi, aucun accès n'est ouvert.",
    }),
  }),
  "staff.invited": (data) => ({
    subject: sanitiseSubject("Votre accès au back-office La Folie Douce"),
    html: renderLayout({
      title: `Bienvenue dans l'équipe${data.firstName === "" ? "" : `, ${data.firstName}`}`,
      body:
        "Un accès au back-office vient d'être ouvert à votre nom.\n\n" +
        "Il ne reste qu'à choisir votre mot de passe. Le lien ci-dessous est valable 7 jours ; " +
        "passé ce délai, demandez à un administrateur de vous en renvoyer un.",
      cta: { label: "Choisir mon mot de passe", url: data.passwordSetupUrl },
      footer:
        "Vous n'attendiez pas cet e-mail ? Ignorez-le : sans mot de passe choisi, aucun accès n'est ouvert.",
    }),
  }),
  "customer.company-attached": (data) => ({
    subject: sanitiseSubject(`${data.companyName} a été ajoutée à votre espace pro`),
    html: renderLayout({
      title: `Bonjour${data.firstName === "" ? "" : `, ${data.firstName}`}`,
      body:
        `L'établissement ${data.companyName} vient d'être rattaché à votre espace professionnel ` +
        "par l'équipe La Folie Douce.\n\n" +
        "Vous le retrouverez à votre prochaine connexion, avec vos identifiants habituels — " +
        "rien de nouveau à créer.",
      footer: "Vous n'attendiez pas ce rattachement ? Répondez à cet e-mail, nous le retirerons.",
    }),
  }),
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
