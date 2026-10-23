import type { AccountMailsCopy } from "../model/account-mails.model.js";

/**
 * La famille « compte client », en français — la langue de référence. Les
 * avis au principal ne nomment que le SITE, jamais la personne (Q4), et ne
 * disent du geste que son nom : ni adresse, ni contact, ni IBAN, ni panier.
 */
export const ACCOUNT_MAILS_FR: AccountMailsCopy = {
  "customer.access-opened": {
    subject: "Votre accès à l'espace pro {company}",
    title: "Bienvenue, {firstName}",
    titleWithoutName: "Bienvenue",
    opened:
      "Un accès à l'espace professionnel de {company} vient d'être ouvert à votre nom " +
      "par l'équipe La Folie Coffee.",
    choosePassword:
      "Il ne reste qu'à choisir votre mot de passe. Le lien ci-dessous est valable 7 jours ; " +
      "passé ce délai, demandez-nous simplement de vous en renvoyer un.",
    choosePasswordCta: "Choisir mon mot de passe",
    signInWithCode:
      "Connectez-vous avec votre adresse {email} : vous recevrez un code par e-mail, " +
      "à taper sur l'écran de connexion. Aucun mot de passe à retenir.",
    signInCta: "Me connecter",
    passwordLink: "Ou choisissez un mot de passe (lien valable 7 jours)",
    footer:
      "Vous n'attendiez pas cet e-mail ? Ignorez-le : tant que personne ne se connecte " +
      "avec cette adresse, l'accès reste inutilisé.",
  },
  "customer.company-attached": {
    subject: "{company} a été ajoutée à votre espace pro",
    title: "Bonjour, {firstName}",
    titleWithoutName: "Bonjour",
    attached:
      "L'établissement {company} vient d'être rattaché à votre espace professionnel " +
      "par l'équipe La Folie Coffee.",
    nothingToCreate:
      "Vous le retrouverez à votre prochaine connexion, avec vos identifiants habituels — " +
      "rien de nouveau à créer.",
    footer: "Vous n'attendiez pas ce rattachement ? Répondez à cet e-mail, nous le retirerons.",
  },
  "customer.login-method-linked": {
    subject: "Une connexion {method} a été ajoutée à votre compte",
    title: "Bonjour, {firstName}",
    titleWithoutName: "Bonjour",
    linked:
      "Vous pouvez désormais vous connecter à votre compte La Folie Coffee avec " +
      "{method}, en plus de votre méthode habituelle.",
    sameAccount: "C'est le même compte : mêmes commandes, mêmes informations.",
    footer:
      "Vous n'avez pas fait cette manipulation ? Répondez à cet e-mail : " +
      "nous retirerons cette méthode de connexion et regarderons ce qui s'est passé.",
  },
  "customer.password-reset": {
    subject: "Votre lien pour changer de mot de passe",
    title: "Changer votre mot de passe",
    requested: "Vous venez de demander à changer le mot de passe de votre compte La Folie Coffee.",
    linkRules:
      "Le lien ci-dessous est à usage unique et expire dans {validity}. " +
      "Il faut le suivre pour choisir votre nouveau mot de passe.",
    validityOneHour: "{count} heure",
    validityHours: "{count} heures",
    cta: "Choisir un nouveau mot de passe",
    footer:
      "Vous n'avez pas fait cette demande ? Ne suivez pas ce lien et répondez à cet " +
      "e-mail : nous regarderons ce qui s'est passé.",
  },
  "customer.sub-account-activity": {
    title: {
      placed: "Commande passée par un de vos sites",
      cancelled: "Commande annulée sur un de vos sites",
      abandoned: "Règlement abandonné sur un de vos sites",
      payment_failed: "Paiement échoué sur un de vos sites",
    },
    action: {
      placed: "a passé la commande",
      cancelled: "a vu sa commande annulée",
      abandoned: "a abandonné le règlement de la commande",
      payment_failed: "n'a pas pu régler la commande",
    },
    subject: "{site} — {title} ({order})",
    body: "Votre site {site} {action} {order}.",
    bodyEnteredByTeam: "Votre site {site} {action} {order} (commande saisie par notre équipe).",
    siteLabel: "Site",
    orderLabel: "Commande",
    dayLabel: "Pour le",
    totalLabel: "Montant TTC",
    footer:
      "Vous recevez ce message parce que ce site est rattaché à votre compte. " +
      "Pour ne plus le recevoir, écrivez-nous : nous réglons ces avis rôle par rôle.",
  },
  "customer.sub-account-gesture": {
    title: {
      problem_reported: "Problème signalé par un de vos sites",
      delivery_address_added: "Adresse de livraison ajoutée sur un de vos sites",
      delivery_address_updated: "Adresse de livraison modifiée sur un de vos sites",
      delivery_address_removed: "Adresse de livraison retirée sur un de vos sites",
      default_delivery_set: "Adresse de livraison par défaut changée sur un de vos sites",
      contact_added: "Contact ajouté sur un de vos sites",
      contact_updated: "Contact modifié sur un de vos sites",
      contact_removed: "Contact retiré sur un de vos sites",
      primary_contact_changed: "Contact principal changé sur un de vos sites",
      bank_account_changed: "Nouveau RIB sur un de vos sites",
      mandate_proof_attached: "Preuve de mandat déposée sur un de vos sites",
      subscription_created: "Panier récurrent créé sur un de vos sites",
      subscription_paused: "Panier récurrent mis en pause sur un de vos sites",
      subscription_resumed: "Panier récurrent repris sur un de vos sites",
      subscription_stopped: "Panier récurrent arrêté sur un de vos sites",
    },
    action: {
      problem_reported: "a signalé un problème sur la commande",
      // Rien de l'adresse : ni ville, ni code postal, ni libellé (Hugo, 2026-10-20).
      delivery_address_added: "a ajouté une adresse de livraison",
      delivery_address_updated: "a modifié une adresse de livraison",
      delivery_address_removed: "a retiré une adresse de livraison",
      default_delivery_set: "a changé son adresse de livraison par défaut",
      // Personne n'est nommé : ni nom, ni rôle, ni e-mail du contact (Q4, RGPD).
      contact_added: "a ajouté un contact",
      contact_updated: "a modifié un contact",
      contact_removed: "a retiré un contact",
      primary_contact_changed: "a changé son contact principal",
      // Ni IBAN, ni ses derniers caractères, ni titulaire, ni BIC (N4d).
      bank_account_changed: "a enregistré un nouveau RIB",
      mandate_proof_attached: "a déposé une preuve de mandat",
      // Rien du panier : ni lignes, ni adresse, ni cadence, ni montant (N4e).
      subscription_created: "a créé un panier récurrent",
      subscription_paused: "a mis en pause un panier récurrent",
      subscription_resumed: "a repris un panier récurrent",
      subscription_stopped: "a arrêté un panier récurrent",
    },
    subject: "{site} — {title}",
    subjectWithReference: "{site} — {title} ({reference})",
    body: "Votre site {site} {action}.",
    bodyWithReference: "Votre site {site} {action} {reference}.",
    bodyByTeam: "Votre site {site} {action} (fait par notre équipe).",
    bodyWithReferenceByTeam: "Votre site {site} {action} {reference} (fait par notre équipe).",
    siteLabel: "Site",
    referenceLabel: "Référence",
    referenceLabelOf: { problem_reported: "Commande" },
    footer:
      "Vous recevez ce message parce que ce site est rattaché à votre compte. " +
      "Pour ne plus le recevoir, écrivez-nous : nous réglons ces avis rôle par rôle.",
  },
};
