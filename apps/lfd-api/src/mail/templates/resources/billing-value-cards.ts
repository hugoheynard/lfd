import { SAME_SENSE, type MailValueCards } from "./mail-value-card.types.js";

/**
 * **Les fiches des valeurs de facturation et de prélèvement** — et des
 * dates et montants, que trois e-mails emploient chacun dans son sens.
 * Exemples des données d'exemple (`specimens/`), relevés le 2026-11-07.
 */
export const BILLING_VALUE_CARDS: Pick<
  MailValueCards,
  | "amount"
  | "buyer"
  | "creditor"
  | "debtor"
  | "day"
  | "document"
  | "number"
  | "numbers"
  | "period"
  | "pieces"
  | "seller"
  | "statement"
  | "title"
  | "total"
> = {
  amount: {
    label: "Montant du prélèvement",
    description:
      "Le montant prélevé, ou annulé ; dans « annoncé précédemment », le montant annoncé avant le rectificatif.",
    example: "1 234,56 €",
    senses: {
      "customer.collection-notice": SAME_SENSE,
      "customer.order-cancelled": {
        label: "Montant remboursé",
        description:
          "Le montant payé par carte, pas encore remboursé, qui sera rendu sur la carte.",
        example: "13,67 €",
      },
      "customer.order-revised": {
        label: "Écart de total",
        description:
          "La différence entre le nouveau total TTC et l'ancien : réglée par carte, ou remboursée sur la carte.",
        example: "2,00 €",
      },
      "customer.order-change-applied": {
        label: "Écart de total",
        description:
          "La différence entre le nouveau total et l'ancien, en plus ou en moins : en HT pour un pro au compte, en TTC sinon.",
        example: "4,50 €",
      },
    },
  },
  buyer: {
    label: "Client facturé",
    description: "Le nom du client à qui la facture est adressée.",
    example: "EXEMPLE — SAS des Trois Ponts",
  },
  creditor: {
    label: "Créancier",
    description: "Le nom de la société qui prélève.",
    example: "EXEMPLE — CRAZEATIVITY",
  },
  debtor: {
    label: "Titulaire du compte prélevé",
    description: "Le nom du titulaire du compte bancaire prélevé.",
    example: "EXEMPLE — SAS des Trois Ponts",
  },
  day: {
    label: "Date du prélèvement",
    description:
      "La date du prélèvement ; dans « nouvelle présentation », celle du prélèvement rejeté ; dans « annoncé précédemment », celle annoncée avant le rectificatif.",
    example: "jeudi 15 octobre 2026",
    senses: {
      "customer.collection-notice": SAME_SENSE,
      "customer.order-cancelled": {
        label: "Jour de la commande",
        description:
          "Le jour de service de la commande annulée ; dans les phrases du bon de fidélité, le dernier jour de validité du bon.",
        example: "mardi 8 septembre",
      },
      "staff.production-dossier": {
        label: "Jour de production",
        description: "Le jour du plan de production arrêté ou complété.",
        example: "mercredi 7 octobre 2026",
      },
    },
  },
  document: {
    label: "Nom du mandat",
    description: "Le nom du mandat à signer, selon son schéma SEPA (particulier ou entreprise).",
    example: "mandat de prélèvement SEPA",
  },
  number: {
    label: "Numéro de facture",
    description: "Le numéro de la facture.",
    example: "EXEMPLE-FA-0001",
    senses: { "customer.invoice-issued": SAME_SENSE, "customer.collection-notice": SAME_SENSE },
  },
  numbers: {
    label: "Numéros de facture",
    description: "Les numéros des factures que le prélèvement règle, séparés par des virgules.",
    example: "EXEMPLE-FA-0001, EXEMPLE-FA-0002",
  },
  period: {
    label: "Période facturée",
    description: "La période des commandes que la facture couvre.",
    example: "du 21 au 27 septembre 2026",
  },
  pieces: {
    label: "Ce que le prélèvement règle",
    description:
      "L'arrêté de facturation, la facture ou les factures prélevées, déjà mis en phrase.",
    example: "de l'arrêté de facturation EXEMPLE-ARR-0001",
    senses: {
      "customer.collection-notice": SAME_SENSE,
      "staff.production-dossier": {
        label: "Nombre de pièces",
        description: "Le nombre de pièces à produire, avec son mot.",
        example: "40 pièces",
      },
    },
  },
  seller: {
    label: "Vendeur",
    description: "Le nom de la société qui émet la facture.",
    example: "EXEMPLE — CRAZEATIVITY",
  },
  statement: {
    label: "Référence de l'arrêté",
    description: "La référence de l'arrêté de facturation que le prélèvement règle.",
    example: "EXEMPLE-ARR-0001",
  },
  title: {
    label: "Titre de l'e-mail",
    description: "Le titre de la facture tel que l'e-mail l'affiche, repris dans l'objet.",
    example: "Votre facture EXEMPLE-FA-0001",
    senses: {
      "customer.invoice-issued": SAME_SENSE,
      "customer.collection-notice": {
        label: "Nature de l'avis",
        description:
          "Premier avis, rectificatif ou annulation : le titre de l'avis, repris dans l'objet.",
        example: "Avis de prélèvement",
      },
      "customer.sub-account-activity": {
        label: "Ce qui s'est passé",
        description: "Le titre de l'événement de commande du site, repris dans l'objet.",
        example: "Commande passée par un de vos sites",
      },
      "customer.sub-account-gesture": {
        label: "Ce qui s'est passé",
        description: "Le titre du geste du site hors commande, repris dans l'objet.",
        example: "Problème signalé par un de vos sites",
      },
    },
  },
  total: {
    label: "Total TTC de la facture",
    description: "Le montant TTC de la facture.",
    example: "1 234,56 €",
    senses: {
      "customer.invoice-issued": SAME_SENSE,
      "customer.order-revised": {
        label: "Nouveau total",
        description:
          "Le total de la commande après la modification : TTC pour un particulier, HT pour un pro au compte, TTC puis HT pour un pro qui paie par carte.",
        example: "13,67 €",
      },
    },
  },
};
