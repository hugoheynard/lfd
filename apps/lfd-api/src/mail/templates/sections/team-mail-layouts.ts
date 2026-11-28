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
    | "staff.production-dossier-updated"
    | "staff.support-requested"
    | "staff.customer-request"
    | "staff.link-payment-received"
    | "staff.pay-link-test"
    | "agency.vitrine-notice"
  >
> = {
  "staff.appointment-booked": {
    ctaDestination: "la page du rendez-vous dans le back-office",
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
    ctaDestination: "l'onglet Alertes du compte dans le back-office",
    subject: SUBJECT,
    header: KICKER,
    sections: [
      { id: "title", texts: texts("title") },
      { id: "body", texts: texts("accountLabel", "orderLabel") },
      { id: "cta", texts: texts("cta") },
    ],
  },
  "staff.invited": {
    ctaDestination: "son lien à usage unique pour choisir son mot de passe du back-office",
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
    outOfEditor: true,
    subject: SUBJECT,
    header: KICKER,
    sections: [
      { id: "title", texts: texts("title") },
      { id: "body", texts: texts("revisionLabel", "senderLabel", "message") },
      { id: "footer", texts: texts("footer") },
    ],
  },
  "staff.password-reset": {
    ctaDestination: "son lien à usage unique pour choisir un nouveau mot de passe du back-office",
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
    ctaDestination: "la page d’accueil du back-office, pour se reconnecter avec son mot de passe",
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
  // Comme le dossier : l'objet est le titre. Le corps énumère des lignes
  // composées par le gabarit, dans l'ordre de l'écran des versions.
  "staff.production-dossier-updated": {
    subject: [],
    header: KICKER,
    sections: [
      { id: "title", texts: texts("subject") },
      {
        id: "body",
        texts: [
          ...variants({ greeting: "Prénom connu", greetingWithoutName: "Prénom inconnu" }),
          ...variants({
            intro: "Une version avait été reçue",
            introNothingReceived: "Aucune version reçue",
          }),
          ...variants({
            productionHeading: "La production change",
            productionUnchanged: "La production ne change pas",
          }),
          ...texts("productionLine", "changesHeading"),
          ...variants({
            enteredArrested: "Entrée à l'arrêt",
            enteredRetaken: "Entrée par un retirage",
            enteredRetakenOffPlan: "Hors plan, entrée par un retirage",
            enteredRearrested: "Refigée après réouverture",
            enteredRearrestedOffPlan: "Refigée après réouverture, reçue hors plan",
            enteredUnknown: "Entrée sans trace",
            revised: "Révisée",
            modifiedDuringReopen: "Modifiée pendant la réouverture",
            linesChanged: "Lignes changées",
            withdrawn: "Annulée après l'arrêt",
            leftAfterWithdrawal: "Annulée, sortie au nouvel arrêt",
          }),
          ...texts("lineChange"),
          ...variants({ otherChange: "Un autre changement", otherChanges: "D'autres changements" }),
          ...texts("shipmentRank", "shipmentUnknown"),
          ...variants({
            resupplyLaunched: "Réassort lancé",
            resupplyEntered: "Réassort entré",
            resupplyLeft: "Réassort sorti",
          }),
          ...texts("resupplyNamed", "resupplyWithoutSite", "toCheckHeading", "toCheckLine"),
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
    ctaDestination: "la demande du client dans le back-office (Commercial, Demandes)",
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
  "staff.link-payment-received": {
    ctaDestination:
      "l'écran du back-office qui ouvre ce que le paiement règle ; absent sans adresse du back-office",
    subject: variants({ subject: "Encaissé", subjectRefused: "Encaissé puis refusé" }),
    header: KICKER,
    sections: [
      { id: "title", texts: variants({ title: "Encaissé", titleRefused: "Encaissé puis refusé" }) },
      {
        id: "body",
        texts: [
          ...texts(
            "amountLabel",
            "payerLabel",
            "settledLabel",
            "applicationLabel",
            "channelLabel",
            "linkLabel",
          ),
          ...variants({
            linkByName: "Lien créé par un membre nommé",
            linkByTeam: "Lien créé par un membre dont le nom manque",
            linkBySystem: "Lien créé par le système",
          }),
          ...texts("outcomeLabel"),
          ...variants({ outcomePaid: "Encaissé", outcomeRefused: "Encaissé puis refusé" }),
        ],
      },
      { id: "cta", texts: texts("cta") },
      { id: "footer", texts: texts("footer") },
    ],
  },
  "staff.pay-link-test": {
    ctaDestination: "la page de paiement du lien d'essai (/payer/…), un vrai paiement de 1 €",
    subject: SUBJECT,
    header: KICKER,
    sections: [
      { id: "title", texts: texts("title") },
      { id: "body", texts: texts("intro", "refund") },
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
