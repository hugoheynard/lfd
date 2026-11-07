import { SAME_SENSE, type MailValueCards } from "./mail-value-card.types.js";

/** Le prénom de qui reçoit l'e-mail : le même sens dans les neuf e-mails qui le placent. */
const RECIPIENT = SAME_SENSE;

/**
 * **Les fiches des valeurs qui désignent des personnes, des sociétés et ce
 * qu'elles ont fait** — comptes, équipe, demandes, dossier de production.
 * Exemples des données d'exemple (`specimens/`), relevés le 2026-11-07.
 */
export const PEOPLE_VALUE_CARDS: Pick<
  MailValueCards,
  | "action"
  | "at"
  | "author"
  | "by"
  | "company"
  | "contact"
  | "email"
  | "figures"
  | "firstName"
  | "form"
  | "head"
  | "method"
  | "order"
  | "orders"
  | "purpose"
  | "reason"
  | "reference"
  | "resupplies"
  | "revision"
  | "rule"
  | "share"
  | "split"
  | "subject"
  | "validity"
  | "when"
> = {
  action: {
    label: "Ce que le site a fait",
    description: "Le geste du site sur une commande, déjà écrit, suivi du numéro de la commande.",
    example: "a passé la commande",
    senses: {
      "customer.sub-account-activity": SAME_SENSE,
      "customer.sub-account-gesture": {
        label: "Ce que le site a fait",
        description:
          "Le geste du site hors commande, déjà écrit (un contact, une adresse, un problème…).",
        example: "a signalé un problème sur la commande",
      },
    },
  },
  at: {
    label: "Moment de l'arrêt",
    description: "Le jour et l'heure où le plan de production a été arrêté, ou complété.",
    example: "mardi 6 octobre 2026 à 20:00",
  },
  author: {
    label: "Auteur de la demande",
    description: "Le nom de la personne qui a envoyé la demande.",
    example: "EXEMPLE — Jeanne Martin",
  },
  by: {
    label: "Auteur de l'arrêt",
    description: "« par » suivi du nom de la personne qui a arrêté, ou complété, le plan.",
    example: "par EXEMPLE — Jeanne Martin",
  },
  company: {
    label: "Société",
    description: "Le nom de la société cliente concernée.",
    example: "EXEMPLE — Hôtel des Trois Ponts",
    senses: {
      "customer.order-cancelled": SAME_SENSE,
      "customer.mandate-to-sign": SAME_SENSE,
      "customer.access-opened": SAME_SENSE,
      "customer.company-attached": SAME_SENSE,
      "staff.account-alert": SAME_SENSE,
    },
  },
  contact: {
    label: "Contact",
    description: "Le nom de la personne qui a pris rendez-vous ou demandé à être contactée.",
    example: "EXEMPLE — Jeanne Martin",
    senses: { "staff.appointment-booked": SAME_SENSE, "staff.support-requested": SAME_SENSE },
  },
  email: {
    label: "Adresse e-mail du destinataire",
    description: "L'adresse avec laquelle la personne se connecte par code.",
    example: "exemple@exemple.invalid",
  },
  figures: {
    label: "Chiffres du plan",
    description:
      "Les chiffres du plan déjà mis en phrase : commandes, retraits et livraisons, pièces, réassorts.",
    example: "3 commandes — 2 en retrait, 1 en livraison — et 40 pièces",
  },
  firstName: {
    label: "Prénom du destinataire",
    description: "Le prénom de la personne qui reçoit l'e-mail.",
    example: "EXEMPLE",
    senses: {
      "customer.order-placed-with-your-email": RECIPIENT,
      "customer.access-opened": RECIPIENT,
      "customer.company-attached": RECIPIENT,
      "customer.login-method-linked": RECIPIENT,
      "staff.invited": RECIPIENT,
      "staff.password-reset": RECIPIENT,
      "staff.access-suspended": RECIPIENT,
      "staff.access-restored": RECIPIENT,
      "staff.production-dossier": RECIPIENT,
    },
  },
  form: {
    label: "Formulaire",
    description: "Le nom du formulaire par lequel la demande est arrivée.",
    example: "Signaler un problème",
  },
  head: {
    label: "Commandes du plan",
    description:
      "Les commandes du plan et leur répartition, déjà mises en phrase, avant les réassorts.",
    example: "1 commande",
  },
  method: {
    label: "Méthode de connexion",
    description: "Le nom de la méthode de connexion ajoutée, tel que l'écran le montre.",
    example: "Google",
  },
  order: {
    label: "Numéro de commande",
    description: "Le numéro de la commande concernée.",
    example: "EXEMPLE-0001",
    senses: { "customer.sub-account-activity": SAME_SENSE, "staff.customer-request": SAME_SENSE },
  },
  orders: {
    label: "Nombre de commandes",
    description: "Le nombre de commandes du plan, avec son mot.",
    example: "3 commandes",
  },
  purpose: {
    label: "Motif du contact",
    description: "Le motif choisi par la personne qui demande à être contactée.",
    example: "Facturation",
  },
  reason: {
    label: "Motif de la demande",
    description: "Le motif choisi dans le formulaire de la demande.",
    example: "Produit abîmé",
  },
  reference: {
    label: "Référence de l'objet du geste",
    description:
      "Ce sur quoi porte le geste du site quand il en a un — le numéro de la commande d'un problème signalé.",
    example: "EXEMPLE-0001",
  },
  resupplies: {
    label: "Nombre de réassorts",
    description: "Le nombre de réassorts des boutiques dans le plan, avec son mot.",
    example: "2 réassorts",
  },
  revision: {
    label: "Révision déployée",
    description:
      "La révision du code mise en service, pour savoir quelle version a envoyé ce contrôle.",
    example: "EXEMPLE",
  },
  rule: {
    label: "Règle d'alerte",
    description: "Le nom de la règle d'alerte qui s'est déclenchée sur le compte.",
    example: "Chute de volume",
  },
  share: {
    label: "Pièces et réassorts",
    description: "Les pièces du plan, dont celles des réassorts, déjà mises en phrase.",
    example: "58 pièces dont 18 de réassort",
  },
  split: {
    label: "Retraits et livraisons",
    description: "Combien de commandes partent en retrait et en livraison, déjà mis en phrase.",
    example: "2 en retrait, 1 en livraison",
  },
  subject: {
    label: "Objet de la demande",
    description:
      "L'objet déjà composé (formulaire, motif, commande, auteur), que « [Urgent] » précède.",
    example: "Signaler un problème — Produit abîmé · EXEMPLE-0001 · EXEMPLE — Jeanne Martin",
  },
  validity: {
    label: "Durée de validité du lien",
    description: "La durée pendant laquelle le lien de mot de passe reste valable, avec son mot.",
    example: "1 heure",
  },
  when: {
    label: "Jour et heure du rendez-vous",
    description: "Le jour et l'heure du rendez-vous, à l'heure de Paris.",
    example: "mardi 13 octobre à 10:00",
  },
};
