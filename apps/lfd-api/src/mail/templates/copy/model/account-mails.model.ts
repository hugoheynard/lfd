/**
 * Les textes des e-mails **du compte client** : l'accès ouvert, une société
 * rattachée, une méthode de connexion, le mot de passe, et les avis au
 * principal de ce que font ses sites.
 */

/** Ce que le site a fait — recopié ici pour que le dictionnaire ne lise pas le gabarit. */
export type SubAccountActivityKind = "placed" | "cancelled" | "abandoned" | "payment_failed";

/** Le geste d'un site hors du cycle d'une commande (N4). */
export type SubAccountGestureKind =
  | "problem_reported"
  | "delivery_address_added"
  | "delivery_address_updated"
  | "delivery_address_removed"
  | "default_delivery_set"
  | "contact_added"
  | "contact_updated"
  | "contact_removed"
  | "primary_contact_changed"
  | "bank_account_changed"
  | "mandate_proof_attached"
  | "subscription_created"
  | "subscription_paused"
  | "subscription_resumed"
  | "subscription_stopped";

/**
 * **« Votre accès à l'espace pro »** — l'invitation d'un client. Le code
 * e-mail d'abord ; le mot de passe en lien secondaire, ou seul quand la
 * boutique n'a pas d'origine connue.
 */
export interface CustomerAccessOpenedCopy {
  /** Le sous-titre du bandeau d'en-tête, sous l'enseigne — rendu en capitales. */
  readonly kicker: string;
  /** `{company}`. */
  readonly subject: string;
  /** `{firstName}`. */
  readonly title: string;
  readonly titleWithoutName: string;
  /** `{company}`. */
  readonly opened: string;
  /** Sans lien de connexion : choisir son mot de passe. */
  readonly choosePassword: string;
  readonly choosePasswordCta: string;
  /** `{email}` — l'adresse avec laquelle se connecter. */
  readonly signInWithCode: string;
  readonly signInCta: string;
  readonly passwordLink: string;
  readonly footer: string;
}

/** **Une société de plus dans un espace existant.** */
export interface CompanyAttachedCopy {
  /** Le sous-titre du bandeau d'en-tête, sous l'enseigne — rendu en capitales. */
  readonly kicker: string;
  /** `{company}`. */
  readonly subject: string;
  /** `{firstName}`. */
  readonly title: string;
  readonly titleWithoutName: string;
  /** `{company}`. */
  readonly attached: string;
  readonly nothingToCreate: string;
  readonly footer: string;
}

/** **Une méthode de connexion a été ajoutée** — la seule alerte d'une porte de plus. */
export interface LoginMethodLinkedCopy {
  /** Le sous-titre du bandeau d'en-tête, sous l'enseigne — rendu en capitales. */
  readonly kicker: string;
  /** `{method}` — « Google », « Facebook ». */
  readonly subject: string;
  /** `{firstName}`. */
  readonly title: string;
  readonly titleWithoutName: string;
  /** `{method}`. */
  readonly linked: string;
  readonly sameAccount: string;
  readonly footer: string;
}

/**
 * **Le lien pour changer de mot de passe**, demandé depuis le profil. Il ne
 * dit rien du mot de passe actuel ni des sessions : rien de cela n'est vérifié.
 */
export interface CustomerPasswordResetCopy {
  /** Le sous-titre du bandeau d'en-tête, sous l'enseigne — rendu en capitales. */
  readonly kicker: string;
  readonly subject: string;
  readonly title: string;
  readonly requested: string;
  /** `{validity}` — la durée du lien, l'une des deux formes qui suivent. */
  readonly linkRules: string;
  /** `{count}` — une heure. */
  readonly validityOneHour: string;
  /** `{count}` — plusieurs heures. */
  readonly validityHours: string;
  readonly cta: string;
  readonly footer: string;
}

/**
 * **« Un de vos sites a… »** — l'avis au principal (N2). Il ne nomme que le
 * site, jamais la personne.
 */
export interface SubAccountActivityCopy {
  /** Le sous-titre du bandeau d'en-tête, sous l'enseigne — rendu en capitales. */
  readonly kicker: string;
  /** Le titre, qui est aussi le cœur de l'objet. */
  readonly title: Readonly<Record<SubAccountActivityKind, string>>;
  /** Ce que le site a fait, glissé dans la phrase du corps. */
  readonly action: Readonly<Record<SubAccountActivityKind, string>>;
  /** `{site}`, `{title}`, `{order}`. */
  readonly subject: string;
  /** `{site}`, `{action}`, `{order}`. */
  readonly body: string;
  /** Le même, quand l'équipe a saisi la commande. */
  readonly bodyEnteredByTeam: string;
  readonly siteLabel: string;
  readonly orderLabel: string;
  readonly dayLabel: string;
  readonly totalLabel: string;
  readonly footer: string;
}

/** **« Un de vos sites a… »** pour un geste hors commande (N4). */
export interface SubAccountGestureCopy {
  /** Le sous-titre du bandeau d'en-tête, sous l'enseigne — rendu en capitales. */
  readonly kicker: string;
  readonly title: Readonly<Record<SubAccountGestureKind, string>>;
  readonly action: Readonly<Record<SubAccountGestureKind, string>>;
  /** `{site}`, `{title}`. */
  readonly subject: string;
  /** `{site}`, `{title}`, `{reference}`. */
  readonly subjectWithReference: string;
  /** `{site}`, `{action}`. */
  readonly body: string;
  /** `{site}`, `{action}`, `{reference}`. */
  readonly bodyWithReference: string;
  /** `{site}`, `{action}` — le geste fait par l'équipe. */
  readonly bodyByTeam: string;
  /** `{site}`, `{action}`, `{reference}`. */
  readonly bodyWithReferenceByTeam: string;
  readonly siteLabel: string;
  /** Le libellé de la référence, quand le geste n'en a pas un à lui. */
  readonly referenceLabel: string;
  /** Les gestes dont la référence a un nom (un signalement porte une commande). */
  readonly referenceLabelOf: Readonly<Partial<Record<SubAccountGestureKind, string>>>;
  readonly footer: string;
}

/** La famille « compte client », une section par clé du registre. */
export interface AccountMailsCopy {
  readonly "customer.access-opened": CustomerAccessOpenedCopy;
  readonly "customer.company-attached": CompanyAttachedCopy;
  readonly "customer.login-method-linked": LoginMethodLinkedCopy;
  readonly "customer.password-reset": CustomerPasswordResetCopy;
  readonly "customer.sub-account-activity": SubAccountActivityCopy;
  readonly "customer.sub-account-gesture": SubAccountGestureCopy;
}
