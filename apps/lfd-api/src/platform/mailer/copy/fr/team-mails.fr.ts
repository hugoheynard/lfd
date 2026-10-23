import type { TeamMailsCopy } from "../model/team-mails.model.js";

/**
 * La famille « équipe », en français — la langue de référence. Les e-mails
 * internes s'écrivent à des gens qui ont le back-office ouvert à côté : des
 * libellés courts, et le lien qui y mène.
 */
export const TEAM_MAILS_FR: TeamMailsCopy = {
  "staff.appointment-booked": {
    kicker: "Rendez-vous",
    subject: "Nouveau rendez-vous — {contact} · {when}",
    title: "Un rendez-vous vient d'être pris",
    contactLabel: "Contact",
    whenLabel: "Quand",
    purposeLabel: "Motif",
    channelLabel: "Canal",
    cta: "Ouvrir le rendez-vous",
    footer: "Alerte interne LFC — envoyée à l'équipe commerciale.",
  },
  "staff.account-alert": {
    kicker: "Alerte compte",
    subject: "Alerte — {company} · {rule}",
    title: "{rule} sur {company}",
    accountLabel: "Compte",
    orderLabel: "Commande",
    cta: "Ouvrir le compte",
  },
  "staff.invited": {
    kicker: "Invitation",
    subject: "Votre accès au back-office La Folie Douce",
    title: "Bienvenue dans l'équipe, {firstName}",
    titleWithoutName: "Bienvenue dans l'équipe",
    opened: "Un accès au back-office vient d'être ouvert à votre nom.",
    choosePassword:
      "Il ne reste qu'à choisir votre mot de passe. Le lien ci-dessous est valable 7 jours ; " +
      "passé ce délai, demandez à un administrateur de vous en renvoyer un.",
    cta: "Choisir mon mot de passe",
    footer:
      "Vous n'attendiez pas cet e-mail ? Ignorez-le : sans mot de passe choisi, aucun accès n'est ouvert.",
  },
  "staff.password-reset": {
    kicker: "Mot de passe",
    subject: "Votre lien de mot de passe — back-office La Folie Douce",
    title: "Nouveau mot de passe, {firstName}",
    titleWithoutName: "Nouveau mot de passe",
    issued:
      "Un lien de changement de mot de passe vient d'être émis pour votre accès au " +
      "back-office.",
    // ⚠️ « votre mot de passe actuel reste valable » n'a jamais été vérifié
    // (cf. le JSDoc de `customer.password-reset` dans `B2bMails`).
    linkRules:
      "Il est valable 7 jours et à usage unique. Si vous ne l'avez pas demandé, votre " +
      "mot de passe actuel reste valable : il suffit d'ignorer ce message.",
    cta: "Choisir un nouveau mot de passe",
  },
  "staff.access-suspended": {
    kicker: "Accès suspendu",
    subject: "Votre accès au back-office est suspendu",
    title: "Accès suspendu, {firstName}",
    titleWithoutName: "Accès suspendu",
    suspended: "Votre accès au back-office La Folie Douce a été suspendu.",
    whatRemains:
      "Vos identifiants restent valables : rien n'a été supprimé, et un administrateur " +
      "peut rouvrir l'accès à tout moment. En attendant, la connexion sera refusée.",
    footer: "Cet e-mail vous prévient d'un changement d'accès. Il ne demande aucune action.",
  },
  "staff.access-restored": {
    kicker: "Accès rétabli",
    subject: "Votre accès au back-office est rétabli",
    title: "Accès rétabli, {firstName}",
    titleWithoutName: "Accès rétabli",
    restored: "Votre accès au back-office La Folie Douce est de nouveau ouvert.",
    howToSignIn:
      "Connectez-vous avec votre mot de passe habituel. Si vous ne l'avez plus, " +
      "demandez un lien à un administrateur.",
    cta: "Ouvrir le back-office",
  },
  "staff.production-dossier": {
    kicker: "Dossier de production",
    subject: "Dossier de production — plan du {day}",
    subjectCompleted: "Dossier de production complété — plan du {day}",
    greeting: "Bonjour {firstName},",
    greetingWithoutName: "Bonjour,",
    arrested: "Le plan de production du {day} a été arrêté {by} le {at}.",
    arrestedWithoutAuthor: "Le plan de production du {day} a été arrêté le {at}.",
    completed:
      "Le plan du {day} a été complété {by} le {at} : " +
      "de nouvelles commandes ont été ajoutées à la fournée.",
    completedWithoutAuthor:
      "Le plan du {day} a été complété le {at} : " +
      "de nouvelles commandes ont été ajoutées à la fournée.",
    attachment:
      "Vous trouverez en pièce jointe le dossier à imprimer : un récapitulatif de ce " +
      "qu'il faut fabriquer, puis un bon par commande.",
    attachmentWithResupplies:
      "Vous trouverez en pièce jointe le dossier à imprimer : un récapitulatif de ce " +
      "qu'il faut fabriquer, puis un bon par commande et par réassort.",
    figures: "En chiffres : {figures}.",
    figuresPlain: "{orders} et {pieces}",
    figuresSplit: "{orders} — {split} — et {pieces}",
    figuresWithResupplies: "{head} — {resupplies} et {share}",
    ordersWithSplit: "{orders} — {split}",
    pickupShare: "{count} en retrait",
    deliveryShare: "{count} en livraison",
    resupplyPieceShare: "{pieces} dont {count} de réassort",
    orderOne: "{count} commande",
    orderMany: "{count} commandes",
    pieceOne: "{count} pièce",
    pieceMany: "{count} pièces",
    resupplyOne: "{count} réassort",
    resupplyMany: "{count} réassorts",
    replacesPrevious: "Ce dossier remplace le précédent.",
    signature: "La Folie Coffee — Fournil",
    footer:
      "Cet e-mail part automatiquement à chaque arrêt du plan. Pour ne plus le recevoir, " +
      "demandez à l'équipe de vous retirer des destinataires (Production › Réglages).",
  },
  "staff.support-requested": {
    kicker: "Demande d'aide",
    subject: "Demande de contact — {contact} · {purpose}",
    title: "Un client demande à être contacté",
    contactLabel: "Contact",
    purposeLabel: "Motif",
    availabilityLabel: "Disponibilité",
    phoneLabel: "Téléphone",
    footer: "Alerte interne LFC — envoyée à l'équipe commerciale.",
  },
  "staff.customer-request": {
    kicker: "Demande client",
    subject: "{form} — {reason} · {author}",
    subjectWithOrder: "{form} — {reason} · {order} · {author}",
    urgentSubject: "[Urgent] {subject}",
    title: "Une demande est arrivée par « {form} »",
    reasonLabel: "Motif",
    orderLabel: "Commande",
    photosLabel: "Photos",
    photosValue: "{count} — à voir au back-office",
    fromLabel: "De",
    emailLabel: "E-mail",
    phoneLabel: "Téléphone",
    originLabel: "Depuis",
    clientLabel: "Client",
    cta: "Ouvrir la demande",
    footer:
      "Répondre à ce courriel écrit directement à son auteur. La demande est rangée au back-office, sous Commercial › Demandes clients.",
  },
  "ops.deploy-check": {
    kicker: "Contrôle de déploiement",
    subject: "[LFC] Courrier opérationnel — {revision}",
    title: "Le courrier sortant fonctionne",
    revisionLabel: "Révision",
    senderLabel: "Expéditeur",
    message:
      "Cet e-mail est parti du backend déployé. Sa seule présence ici prouve que " +
      "la clé Resend atteint le container, que l'expéditeur est sur un domaine " +
      "vérifié, et que le message est délivré.",
    footer:
      "Message automatique de contrôle, envoyé à chaque déploiement. " +
      "S'il cesse d'arriver, le canal e-mail est tombé — même si rien d'autre ne le dit.",
  },
  "agency.vitrine-notice": {
    kicker: "Annonce vitrine",
    footer:
      "Vous recevez ce message comme contact d'un abonné au webhook de la vitrine de La Folie Douce.",
  },
};
