import {
  KICKER,
  NAMED_TITLE,
  SUBJECT,
  texts,
  variants,
  type MailLayouts,
} from "./mail-layout.types.js";

/** Les e-mails de l'équipe et de l'agence. */
export const TEAM_MAIL_LAYOUTS: Readonly<
  Pick<
    MailLayouts,
    | "staff.appointment-booked"
    | "staff.account-alert"
    | "staff.invited"
    | "ops.deploy-check"
    | "staff.password-reset"
    | "staff.access-suspended"
    | "staff.access-restored"
    | "staff.production-dossier"
    | "staff.support-requested"
    | "staff.customer-request"
    | "agency.vitrine-notice"
  >
> = {
  "staff.appointment-booked": {
    subject: SUBJECT,
    header: KICKER,
    sections: [
      { id: "title", texts: texts("title") },
      {
        id: "body",
        texts: texts("contactLabel", "whenLabel", "purposeLabel", "channelLabel"),
      },
      { id: "cta", texts: texts("cta") },
      { id: "footer", texts: texts("footer") },
    ],
  },
  "staff.account-alert": {
    subject: SUBJECT,
    header: KICKER,
    sections: [
      { id: "title", texts: texts("title") },
      { id: "body", texts: texts("accountLabel", "orderLabel") },
      { id: "cta", texts: texts("cta") },
    ],
  },
  "staff.invited": {
    subject: SUBJECT,
    header: KICKER,
    sections: [
      { id: "title", texts: NAMED_TITLE },
      { id: "body", texts: texts("opened", "choosePassword") },
      { id: "cta", texts: texts("cta") },
      { id: "footer", texts: texts("footer") },
    ],
  },
  "ops.deploy-check": {
    subject: SUBJECT,
    header: KICKER,
    sections: [
      { id: "title", texts: texts("title") },
      { id: "body", texts: texts("revisionLabel", "senderLabel", "message") },
      { id: "footer", texts: texts("footer") },
    ],
  },
  "staff.password-reset": {
    subject: SUBJECT,
    header: KICKER,
    sections: [
      { id: "title", texts: NAMED_TITLE },
      { id: "body", texts: texts("issued", "linkRules") },
      { id: "cta", texts: texts("cta") },
    ],
  },
  "staff.access-suspended": {
    subject: SUBJECT,
    header: KICKER,
    sections: [
      { id: "title", texts: NAMED_TITLE },
      { id: "body", texts: texts("suspended", "whatRemains") },
      { id: "footer", texts: texts("footer") },
    ],
  },
  "staff.access-restored": {
    subject: SUBJECT,
    header: KICKER,
    sections: [
      { id: "title", texts: NAMED_TITLE },
      { id: "body", texts: texts("restored", "howToSignIn") },
      { id: "cta", texts: texts("cta") },
    ],
  },
  // L'objet de ce dossier EST son titre : ses deux textes vivent dans la
  // section titre, où l'aperçu les montre, et l'objet les reprend.
  "staff.production-dossier": {
    subject: [],
    header: KICKER,
    sections: [
      {
        id: "title",
        texts: variants({ subject: "Dossier arrêté", subjectCompleted: "Dossier complété" }),
      },
      {
        id: "body",
        texts: [
          ...variants({ greeting: "Prénom connu", greetingWithoutName: "Prénom inconnu" }),
          ...variants({
            arrested: "Dossier arrêté",
            arrestedWithoutAuthor: "Dossier arrêté, sans auteur connu",
            completed: "Dossier complété",
            completedWithoutAuthor: "Dossier complété, sans auteur connu",
            attachment: "Sans réassort",
            attachmentWithResupplies: "Avec réassort",
          }),
          ...texts("figures"),
          ...variants({
            figuresPlain: "Ni retrait ni livraison détaillés",
            figuresSplit: "Retraits et livraisons détaillés",
            figuresWithResupplies: "Avec réassort",
            ordersWithSplit: "Avec réassort, retraits et livraisons détaillés",
          }),
          ...texts("pickupShare", "deliveryShare", "resupplyPieceShare"),
          ...variants({
            orderOne: "Une commande",
            orderMany: "Plusieurs commandes",
            pieceOne: "Une pièce",
            pieceMany: "Plusieurs pièces",
            resupplyOne: "Un réassort",
            resupplyMany: "Plusieurs réassorts",
            replacesPrevious: "Dossier complété",
          }),
          ...texts("signature"),
        ],
      },
      { id: "footer", texts: texts("footer") },
    ],
  },
  "staff.support-requested": {
    subject: SUBJECT,
    header: KICKER,
    sections: [
      { id: "title", texts: texts("title") },
      {
        id: "body",
        texts: texts("contactLabel", "purposeLabel", "availabilityLabel", "phoneLabel"),
      },
      { id: "footer", texts: texts("footer") },
    ],
  },
  "staff.customer-request": {
    subject: variants({
      subject: "Sans commande",
      subjectWithOrder: "Avec une commande",
      urgentSubject: "Demande urgente",
    }),
    header: KICKER,
    sections: [
      { id: "title", texts: texts("title") },
      {
        id: "body",
        texts: texts(
          "reasonLabel",
          "orderLabel",
          "photosLabel",
          "photosValue",
          "fromLabel",
          "emailLabel",
          "phoneLabel",
          "originLabel",
          "clientLabel",
        ),
      },
      { id: "cta", texts: texts("cta") },
      { id: "footer", texts: texts("footer") },
    ],
  },
  // L'annonce de l'agence : son titre et son corps sont SAISIS par l'agence
  // au moment de l'envoi — des données, pas des textes du dictionnaire.
  "agency.vitrine-notice": {
    subject: [],
    header: KICKER,
    sections: [
      { id: "title", nature: "system", texts: [] },
      { id: "body", nature: "system", texts: [] },
      { id: "footer", texts: texts("footer") },
    ],
  },
};
