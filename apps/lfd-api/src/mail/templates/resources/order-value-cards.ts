import { SAME_SENSE, type MailValueCards } from "./mail-value-card.types.js";

/** La référence d'une commande, telle que tous les e-mails de commande la placent. */
const ORDER_REFERENCE = SAME_SENSE;

/**
 * **Les fiches des valeurs d'une commande** : sa référence, son créneau, son
 * contenu, son argent. Exemples des données d'exemple (`specimens/`), sauf
 * mention : aucun cas ne rend une ligne au poids, une base de remise ni un
 * taux de TVA, leurs exemples viennent des tests du gabarit (relevé le
 * 2026-11-07).
 */
export const ORDER_VALUE_CARDS: Pick<
  MailValueCards,
  | "ref"
  | "start"
  | "end"
  | "count"
  | "name"
  | "weight"
  | "base"
  | "rate"
  | "site"
  | "principal"
  | "value"
  | "remainder"
  | "previous"
  | "product"
  | "quantity"
> = {
  ref: {
    label: "Référence de commande",
    description:
      "Le numéro de la commande, celui que le client lit sur son bon et dans « Mes commandes ».",
    example: "EXEMPLE-0001",
    senses: {
      "customer.order-placed": ORDER_REFERENCE,
      "customer.order-ready": ORDER_REFERENCE,
      "customer.order-delayed": ORDER_REFERENCE,
      "customer.payment-failed": ORDER_REFERENCE,
      "customer.payment-expired": ORDER_REFERENCE,
      "customer.order-payment-link": ORDER_REFERENCE,
      "customer.order-cancelled": ORDER_REFERENCE,
      "customer.order-change-applied": ORDER_REFERENCE,
      "customer.order-change-refused": ORDER_REFERENCE,
      "customer.order-shortfall": ORDER_REFERENCE,
      "customer.mandate-to-sign": {
        label: "Référence du mandat (RUM)",
        description:
          "La référence unique du mandat de prélèvement SEPA à signer, pas une commande.",
        example: "EXEMPLE-RUM-0001",
      },
    },
  },
  start: {
    label: "Début du créneau",
    description: "L'heure de début du créneau de retrait ou de livraison.",
    example: "07:00",
    senses: { "customer.order-placed": SAME_SENSE, "customer.delivery-en-route": SAME_SENSE },
  },
  end: {
    label: "Fin du créneau",
    description:
      "L'heure de fin du créneau de retrait ou de livraison ; seule quand le créneau dit « avant … ».",
    example: "09:00",
    senses: { "customer.order-placed": SAME_SENSE, "customer.delivery-en-route": SAME_SENSE },
  },
  count: {
    label: "Nombre de pièces",
    description: "Le nombre de pièces vendues à la pièce dans la commande, ligne « Contenu ».",
    example: "12",
    senses: {
      "customer.order-placed": SAME_SENSE,
      "customer.order-ready": {
        label: "Nombre de pièces",
        description:
          "Le nombre de pièces vendues à la pièce dans la commande — ou dans le reste de la commande, pour l'envoi du reste.",
        example: "12",
      },
      "customer.password-reset": {
        label: "Nombre d'heures",
        description: "Le nombre d'heures pendant lesquelles le lien de mot de passe reste valable.",
        example: "1",
      },
      "staff.production-dossier": {
        label: "Nombre",
        description:
          "Le nombre que la phrase compte : commandes, pièces, réassorts, commandes en retrait ou en livraison, ou pièces de réassort.",
        example: "3",
      },
      "staff.customer-request": {
        label: "Nombre de photos",
        description: "Le nombre de photos jointes à la demande du client.",
        example: "2",
      },
    },
  },
  name: {
    label: "Produit vendu au poids",
    description: "Le nom d'un produit vendu au poids, dans la ligne « Contenu » du récapitulatif.",
    example: "Saumon gravlax",
    senses: {
      "customer.order-placed": SAME_SENSE,
      "customer.order-ready": SAME_SENSE,
      "customer.order-cancelled": {
        label: "Personne qui a annulé",
        description:
          "Le nom de la personne qui a annulé la commande : un autre membre de la société, ou une personne du compte principal.",
        example: "EXEMPLE — Jeanne M.",
      },
    },
  },
  weight: {
    label: "Poids commandé",
    description: "Le poids commandé d'un produit vendu au poids.",
    example: "500 g",
    senses: { "customer.order-placed": SAME_SENSE, "customer.order-ready": SAME_SENSE },
  },
  base: {
    label: "Montant éligible à la remise",
    description: "Le montant HT des articles sur lesquels la remise de retrait s'applique.",
    example: "100,00 €",
  },
  rate: {
    label: "Taux de TVA",
    description:
      "Un taux de TVA de la commande, en pour cent, au pied du récapitulatif d'une commande en TTC.",
    example: "5,5",
  },
  site: {
    label: "Site",
    description: "Le nom du site — un établissement rattaché à la société — qui a fait le geste.",
    example: "EXEMPLE — Chalet Gentiane",
    senses: {
      "customer.sub-account-activity": SAME_SENSE,
      "customer.sub-account-gesture": SAME_SENSE,
      "customer.order-ready": {
        label: "Point de retrait",
        description: "Le nom du point de retrait où la commande attend le client.",
        example: "Le Labo",
      },
    },
  },
  principal: {
    label: "Compte principal",
    description:
      "Le nom du compte principal (la société mère) dont une personne a annulé la commande.",
    example: "EXEMPLE — Groupe des Alpes",
  },
  value: {
    label: "Valeur du bon de fidélité",
    description: "La valeur du bon de fidélité rendu au client après l'annulation.",
    example: "5,00 €",
  },
  remainder: {
    label: "Valeur du bon en reliquat",
    description: "La valeur du bon remis en reliquat, que le bon rendu remplace.",
    example: "1,20 €",
  },
  previous: {
    label: "Ancien total",
    description: "Le total TTC de la commande avant la modification.",
    example: "38,00 €",
  },
  product: {
    label: "Produit",
    description: "Le nom d'un produit, dans la liste de ce qui part ou de ce qui manque.",
    example: "Croissant au beurre",
  },
  quantity: {
    label: "Quantité",
    description: "La quantité de ce produit, à la pièce ou au poids.",
    example: "4",
  },
};
