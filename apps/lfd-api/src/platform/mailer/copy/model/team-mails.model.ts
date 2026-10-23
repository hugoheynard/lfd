/**
 * Les textes des e-mails **de l'équipe** — alertes internes, accès au
 * back-office, dossier du fournil —, du contrôle de mise en service et de
 * l'annonce à l'agence de la vitrine.
 *
 * Les libellés de détail (« Contact », « Motif »…) sont des textes ; la forme
 * « Libellé : valeur » et les guillemets autour d'un message saisi sont de la
 * mise en page, et restent dans le gabarit.
 */

/** **Un rendez-vous vient d'être pris.** */
export interface AppointmentBookedCopy {
  /** Le sous-titre du bandeau d'en-tête, sous l'enseigne — rendu en capitales. */
  readonly kicker: string;
  /** `{contact}`, `{when}`. */
  readonly subject: string;
  readonly title: string;
  readonly contactLabel: string;
  readonly whenLabel: string;
  readonly purposeLabel: string;
  readonly channelLabel: string;
  readonly cta: string;
  readonly footer: string;
}

/** **Une alerte s'est déclenchée sur un compte.** */
export interface AccountAlertCopy {
  /** Le sous-titre du bandeau d'en-tête, sous l'enseigne — rendu en capitales. */
  readonly kicker: string;
  /** `{company}`, `{rule}`. */
  readonly subject: string;
  /** `{rule}`, `{company}`. */
  readonly title: string;
  readonly accountLabel: string;
  readonly orderLabel: string;
  readonly cta: string;
}

/** **Le contrôle de mise en service** — son arrivée est l'information. */
export interface DeployCheckCopy {
  /** Le sous-titre du bandeau d'en-tête, sous l'enseigne — rendu en capitales. */
  readonly kicker: string;
  /** `{revision}`. */
  readonly subject: string;
  readonly title: string;
  readonly revisionLabel: string;
  readonly senderLabel: string;
  readonly message: string;
  readonly footer: string;
}

/** **Un accès au back-office vient d'être ouvert.** */
export interface StaffInvitedCopy {
  /** Le sous-titre du bandeau d'en-tête, sous l'enseigne — rendu en capitales. */
  readonly kicker: string;
  readonly subject: string;
  /** `{firstName}`. */
  readonly title: string;
  readonly titleWithoutName: string;
  readonly opened: string;
  readonly choosePassword: string;
  readonly cta: string;
  readonly footer: string;
}

/** **Un lien de mot de passe pour quelqu'un déjà entré.** */
export interface StaffPasswordResetCopy {
  /** Le sous-titre du bandeau d'en-tête, sous l'enseigne — rendu en capitales. */
  readonly kicker: string;
  readonly subject: string;
  /** `{firstName}`. */
  readonly title: string;
  readonly titleWithoutName: string;
  readonly issued: string;
  readonly linkRules: string;
  readonly cta: string;
}

/** **L'accès est suspendu** — elle l'apprend par nous, pas par un refus. */
export interface StaffAccessSuspendedCopy {
  /** Le sous-titre du bandeau d'en-tête, sous l'enseigne — rendu en capitales. */
  readonly kicker: string;
  readonly subject: string;
  /** `{firstName}`. */
  readonly title: string;
  readonly titleWithoutName: string;
  readonly suspended: string;
  readonly whatRemains: string;
  readonly footer: string;
}

/** **L'accès est rouvert.** */
export interface StaffAccessRestoredCopy {
  /** Le sous-titre du bandeau d'en-tête, sous l'enseigne — rendu en capitales. */
  readonly kicker: string;
  readonly subject: string;
  /** `{firstName}`. */
  readonly title: string;
  readonly titleWithoutName: string;
  readonly restored: string;
  readonly howToSignIn: string;
  readonly cta: string;
}

/**
 * **Le dossier de production du jour**, PDF joint. Les comptes se disent au
 * singulier jusqu'à un, au pluriel au-delà ; une part à zéro se tait.
 */
export interface ProductionDossierCopy {
  /** Le sous-titre du bandeau d'en-tête, sous l'enseigne — rendu en capitales. */
  readonly kicker: string;
  /** `{day}` — l'objet, qui est aussi le titre. */
  readonly subject: string;
  /** `{day}` — après un retirage. */
  readonly subjectCompleted: string;
  /** `{firstName}`. */
  readonly greeting: string;
  readonly greetingWithoutName: string;
  /** `{day}`, `{by}` (« par Marie Dupont », « automatiquement »), `{at}`. */
  readonly arrested: string;
  /** `{day}`, `{at}`. */
  readonly arrestedWithoutAuthor: string;
  /** `{day}`, `{by}`, `{at}`. */
  readonly completed: string;
  /** `{day}`, `{at}`. */
  readonly completedWithoutAuthor: string;
  readonly attachment: string;
  readonly attachmentWithResupplies: string;
  /** `{figures}` — l'une des trois formes qui suivent. */
  readonly figures: string;
  /** `{orders}`, `{pieces}`. */
  readonly figuresPlain: string;
  /** `{orders}`, `{split}` (« 2 en retrait, 1 en livraison »), `{pieces}`. */
  readonly figuresSplit: string;
  /** `{head}` (les commandes, avec leur répartition s'il y en a une), `{resupplies}`, `{share}`. */
  readonly figuresWithResupplies: string;
  /** `{orders}`, `{split}`. */
  readonly ordersWithSplit: string;
  /** `{count}`. */
  readonly pickupShare: string;
  /** `{count}`. */
  readonly deliveryShare: string;
  /** `{pieces}`, `{count}` — les pièces de réassort parmi toutes. */
  readonly resupplyPieceShare: string;
  /** `{count}` — une commande au plus. */
  readonly orderOne: string;
  readonly orderMany: string;
  readonly pieceOne: string;
  readonly pieceMany: string;
  readonly resupplyOne: string;
  readonly resupplyMany: string;
  readonly replacesPrevious: string;
  readonly signature: string;
  readonly footer: string;
}

/** **Un client demande à être rappelé ou écrit.** */
export interface SupportRequestedCopy {
  /** Le sous-titre du bandeau d'en-tête, sous l'enseigne — rendu en capitales. */
  readonly kicker: string;
  /** `{contact}`, `{purpose}`. */
  readonly subject: string;
  readonly title: string;
  readonly contactLabel: string;
  readonly purposeLabel: string;
  readonly availabilityLabel: string;
  readonly phoneLabel: string;
  readonly footer: string;
}

/** **Une demande client** (« Nous écrire », « Signaler un problème »). */
export interface CustomerRequestCopy {
  /** Le sous-titre du bandeau d'en-tête, sous l'enseigne — rendu en capitales. */
  readonly kicker: string;
  /** `{form}`, `{reason}`, `{author}`. */
  readonly subject: string;
  /** `{form}`, `{reason}`, `{order}`, `{author}`. */
  readonly subjectWithOrder: string;
  /** `{subject}` — une demande marquée urgente. */
  readonly urgentSubject: string;
  /** `{form}`. */
  readonly title: string;
  readonly reasonLabel: string;
  readonly orderLabel: string;
  readonly photosLabel: string;
  /** `{count}`. */
  readonly photosValue: string;
  readonly fromLabel: string;
  readonly emailLabel: string;
  readonly phoneLabel: string;
  readonly originLabel: string;
  readonly clientLabel: string;
  readonly cta: string;
  readonly footer: string;
}

/** **L'annonce à l'agence de la vitrine** — l'objet et le message sont saisis au back-office. */
export interface VitrineNoticeCopy {
  /** Le sous-titre du bandeau d'en-tête, sous l'enseigne — rendu en capitales. */
  readonly kicker: string;
  readonly footer: string;
}

/** La famille « équipe », une section par clé du registre. */
export interface TeamMailsCopy {
  readonly "staff.appointment-booked": AppointmentBookedCopy;
  readonly "staff.account-alert": AccountAlertCopy;
  readonly "staff.invited": StaffInvitedCopy;
  readonly "staff.password-reset": StaffPasswordResetCopy;
  readonly "staff.access-suspended": StaffAccessSuspendedCopy;
  readonly "staff.access-restored": StaffAccessRestoredCopy;
  readonly "staff.production-dossier": ProductionDossierCopy;
  readonly "staff.support-requested": SupportRequestedCopy;
  readonly "staff.customer-request": CustomerRequestCopy;
  readonly "ops.deploy-check": DeployCheckCopy;
  readonly "agency.vitrine-notice": VitrineNoticeCopy;
}
