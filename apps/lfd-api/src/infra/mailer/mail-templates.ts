import {
  renderLayout,
  sanitiseSubject,
  type LayoutInput,
  type TemplateRegistry,
} from "@lfd/mailer";

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
  /**
   * **Le contrôle de mise en service**, envoyé après chaque déploiement à
   * l'admin de secours. Son contenu n'a aucun intérêt — c'est son **arrivée**
   * qui est l'information, et elle prouve la chaîne entière : clé parvenue
   * jusqu'au NestJS, expéditeur sur un domaine vérifié, Resend qui accepte,
   * DKIM qui signe, boîte qui reçoit.
   */
  "ops.deploy-check": {
    /** La révision déployée — pour savoir QUELLE image a prouvé quoi. */
    readonly revision: string;
    /** L'expéditeur réellement utilisé. Le lire dans le corps évite d'aller
     *  fouiller les en-têtes pour vérifier qu'il est bien celui qu'on croit. */
    readonly fromAddress: string;
  };
  /**
   * Un lien de mot de passe pour quelqu'un **déjà entré**. Distinct de
   * `staff.invited` : on n'invite pas une personne qui travaille ici depuis six
   * mois, on lui rouvre une porte qu'elle a elle-même refermée.
   */
  "staff.password-reset": {
    readonly firstName: string;
    readonly passwordSetupUrl: string;
  };
  /** Son accès vient d'être fermé. Elle l'apprend par nous, pas par un refus. */
  "staff.access-suspended": {
    readonly firstName: string;
  };
  /** Son accès est rouvert — elle peut se reconnecter avec son mot de passe. */
  "staff.access-restored": {
    readonly firstName: string;
    readonly backOfficeUrl: string;
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

/** Ce dont les gabarits ont besoin et qu'ils ne peuvent pas déduire. */
export interface MailBranding {
  /** L'adresse de recours — l'admin racine, la seule qui ne peut pas disparaître. */
  readonly supportEmail: string;
  /** Racine du back-office, pour les liens de retour. */
  readonly backOfficeUrl: string;
}

/**
 * Les gabarits, **construits** avec la marque plutôt que déclarés à plat.
 *
 * Un `const` obligeait chaque gabarit à se souvenir du bandeau et de l'adresse
 * de recours ; le premier ajout les aurait oubliés, et personne ne l'aurait vu —
 * un e-mail sans recours ne produit aucune erreur, juste quelqu'un qui reste
 * bloqué. Ici, `person()` les pose pour tout le monde.
 */
export function b2bMailTemplates(brand: MailBranding): TemplateRegistry<B2bMails> {
  /** La coquille des e-mails adressés à une PERSONNE : marque + recours. */
  const person = (input: Omit<LayoutInput, "brand" | "supportEmail">): string =>
    renderLayout({ ...input, brand: "La Folie Douce", supportEmail: brand.supportEmail });

  return {
    "ops.deploy-check": (data) => ({
      subject: sanitiseSubject(`[LFC] Courrier opérationnel — ${data.revision}`),
      html: renderLayout({
        title: "Le courrier sortant fonctionne",
        body: detailsBody(
          [
            ["Révision", data.revision],
            ["Expéditeur", data.fromAddress],
          ],
          "Cet e-mail est parti du backend déployé. Sa seule présence ici prouve que " +
            "la clé Resend atteint le container, que l'expéditeur est sur un domaine " +
            "vérifié, et que le message est délivré.",
        ),
        footer:
          "Message automatique de contrôle, envoyé à chaque déploiement. " +
          "S'il cesse d'arriver, le canal e-mail est tombé — même si rien d'autre ne le dit.",
      }),
    }),
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
      html: person({
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
      html: person({
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
      html: person({
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
    "staff.password-reset": (data) => ({
      subject: sanitiseSubject("Votre lien de mot de passe — back-office La Folie Douce"),
      html: person({
        title: `Nouveau mot de passe${data.firstName === "" ? "" : `, ${data.firstName}`}`,
        body:
          "Un lien de changement de mot de passe vient d'être émis pour votre accès au " +
          "back-office.\n\n" +
          "Il est valable 7 jours et à usage unique. Si vous ne l'avez pas demandé, votre " +
          "mot de passe actuel reste valable : il suffit d'ignorer ce message.",
        cta: { label: "Choisir un nouveau mot de passe", url: data.passwordSetupUrl },
      }),
    }),
    "staff.access-suspended": (data) => ({
      subject: sanitiseSubject("Votre accès au back-office est suspendu"),
      html: person({
        title: `Accès suspendu${data.firstName === "" ? "" : `, ${data.firstName}`}`,
        body:
          "Votre accès au back-office La Folie Douce a été suspendu.\n\n" +
          "Vos identifiants restent valables : rien n'a été supprimé, et un administrateur " +
          "peut rouvrir l'accès à tout moment. En attendant, la connexion sera refusée.",
        // Pas de bouton : proposer « se connecter » à quelqu'un dont la porte est
        // fermée l'enverrait se heurter à un refus, ce qu'il vient de lire.
        footer: "Cet e-mail vous prévient d'un changement d'accès. Il ne demande aucune action.",
      }),
    }),
    "staff.access-restored": (data) => ({
      subject: sanitiseSubject("Votre accès au back-office est rétabli"),
      html: person({
        title: `Accès rétabli${data.firstName === "" ? "" : `, ${data.firstName}`}`,
        body:
          "Votre accès au back-office La Folie Douce est de nouveau ouvert.\n\n" +
          "Connectez-vous avec votre mot de passe habituel. Si vous ne l'avez plus, " +
          "demandez un lien à un administrateur.",
        cta: { label: "Ouvrir le back-office", url: data.backOfficeUrl },
      }),
    }),
  };
}
