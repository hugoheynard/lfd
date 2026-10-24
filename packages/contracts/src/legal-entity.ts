import { z } from "zod";

/**
 * Les bornes du **délai de pré-notification**, recopiées du domaine.
 *
 * Le domaine reste l'autorité : `LegalEntity.setPreNotificationDays` refuse tout
 * ce qui sort de ces bornes, et c'est lui qu'un test éprouve. Ce qui est ici sert
 * au champ de saisie — un écran qui laisse taper 400 pour se faire répondre non
 * par le serveur est un écran qui fait perdre une saisie.
 */
/** Trois jours au moins depuis le 2026-10-24 (Hugo). */
export const PRE_NOTIFICATION_MIN_DAYS = 3;
export const PRE_NOTIFICATION_MAX_DAYS = 60;

/**
 * Les bornes du **calendrier de prélèvement**, recopiées du domaine
 * (`CollectionSchedule`), qui reste l'autorité. Plan
 * `documentation/comptabilite/prelevement/prelevement-automatique.md`, PA1.
 */
export const AUTO_COLLECTION_DELAY_MIN_HOURS = 1;
/** Au plus 23 : la constitution reste le jour de la clôture, et le préavis entier. */
export const AUTO_COLLECTION_DELAY_MAX_HOURS = 23;
export const COLLECTION_DAYS_MAX = 60;
export const DEPOSIT_CUTOFF_MIN_BUSINESS_DAYS = 1;
export const DEPOSIT_CUTOFF_MAX_BUSINESS_DAYS = 10;

/** Le cut-off du portail bancaire : k jours ouvrés TARGET2 avant l'échéance, à HH:MM. */
export interface DepositCutoffView {
  readonly businessDaysBefore: number;
  /** `HH:MM`, heure de Paris. */
  readonly time: string;
}

/** Les trois rythmes de facturation (plan `plan-rythme-de-facturation.md`, §2.1). */
export const billingRhythmKindSchema = z.enum(["monthly", "semimonthly", "weekly"]);
export type BillingRhythmKind = z.infer<typeof billingRhythmKindSchema>;

/** Le genre tel que l'écran le dit (« bimensuel » serait ambigu, §0 du plan). */
export const BILLING_RHYTHM_KIND_LABELS: Readonly<Record<BillingRhythmKind, string>> = {
  monthly: "Mensuel",
  semimonthly: "Deux fois par mois",
  weekly: "Hebdomadaire",
};

/**
 * Une clôture À VENIR et la période qu'elle ferme (plan
 * `plan-rythme-de-facturation.md`, §6) — calculée par le serveur sur la suite
 * qui fera foi ce jour-là, bascule programmée comprise.
 */
export interface UpcomingClosureView {
  /** ISO — la clôture, 00h00 heure de Paris (exclusive). */
  readonly closesAt: string;
  /** « du 1er au 31 octobre 2026 » — jours locaux, dernier jour inclus. */
  readonly periodLabel: string;
  /** `AAAA-MM-JJ` — le jour où sa facture s'émet : la veille de la clôture. */
  readonly invoicedOn: string;
  /**
   * La durée de la période, en jours locaux de Paris (1 = un seul jour). Comptée
   * par le serveur, sur le même calendrier que `periodLabel` : l'écran qui
   * avertit d'une première période trop courte ne refait pas le compte.
   */
  readonly periodDays: number;
}

/**
 * Les dates d'un mode : jours du mois de 1 à 28 (un pour le mensuel, deux
 * triés pour deux fois par mois), ou jour de semaine de 1 = lundi à 7 =
 * dimanche pour l'hebdomadaire. Clôture à 00h00 heure de Paris.
 */
export interface BillingModeDatesView {
  readonly days: readonly number[];
  /** ISO — depuis quand elles font foi ; `null` = les dates par défaut, jamais réglées. */
  readonly since: string | null;
}

/** Des dates programmées, et la clôture du mode (ISO) où elles prennent effet. */
export interface ScheduledBillingModeDatesView {
  readonly days: readonly number[];
  readonly effectiveAt: string;
}

/**
 * **Un mode de facturation de l'entité** (plan `plan-rythme-de-facturation.md`,
 * §16) : ses dates, le changement programmé, le verrou « un seul à la fois »
 * et ses trois prochaines clôtures.
 */
export interface LegalEntityBillingModeView {
  readonly mode: BillingRhythmKind;
  readonly current: BillingModeDatesView;
  readonly scheduled: ScheduledBillingModeDatesView | null;
  /**
   * ISO — tant qu'un changement n'a pas pris effet, un autre est refusé (409) ;
   * c'est la date à partir de laquelle il redevient possible. `null` : libre.
   * Le programmé, lui, s'annule jusqu'à cette date.
   */
  readonly changeLockedUntil: string | null;
  /** Les trois prochaines clôtures du mode, la plus proche d'abord. */
  readonly upcomingClosures: readonly UpcomingClosureView[];
  /**
   * Les payeurs qui ont CHOISI ce mode (en vigueur ou programmé). ⚠️ Pour le
   * mensuel, ne compte pas ceux qui n'ont rien choisi — ils sont mensuels par
   * défaut, et la comptabilité ne tient pas la liste des payeurs. Décidé par
   * Hugo le 2026-10-12 (plan `plan-rythme-de-facturation.md`, §16.9-6) :
   * l'écran le dit « N clients ont choisi ce mode », sans prétendre compter
   * les autres.
   */
  readonly payerCount: number;
}

/**
 * **Le mode de facturation d'un payeur** (`GET …/payers/:companyId/billing-mode`) :
 * en vigueur, programmé, verrou, et ses trois prochaines clôtures.
 */
export interface PayerBillingModeView {
  readonly legalEntityId: string;
  readonly payerCompanyId: string;
  readonly mode: BillingRhythmKind;
  /** ISO — depuis quand ; `null` = mensuel par défaut, jamais choisi. */
  readonly since: string | null;
  readonly scheduled: { readonly mode: BillingRhythmKind; readonly effectiveAt: string } | null;
  /** ISO — un autre changement est refusé jusqu'à cette date ; `null` : libre. */
  readonly changeLockedUntil: string | null;
  readonly upcomingClosures: readonly UpcomingClosureView[];
}

/** Une limite locale — un jour et une heure de Paris. */
export interface LocalDeadlineView {
  /** `AAAA-MM-JJ`. */
  readonly day: string;
  /** `HH:MM`. */
  readonly time: string;
}

/**
 * Le calendrier d'UN cycle, calculé par le serveur (`collectionCalendar`) :
 * l'écran l'affiche, il ne le recalcule pas — un second calcul de TARGET2
 * côté front dirait tôt ou tard une autre date que le fichier.
 */
export interface CollectionCalendarView {
  /** ISO — la clôture du cycle (exclusive). */
  readonly closesAt: string;
  /** ISO — clôture + délai de l'automatisme, qu'il soit activé ou non. */
  readonly plannedConstitutionAt: string;
  /** `AAAA-MM-JJ` — l'échéance, jour ouvré TARGET2. */
  readonly collectionDay: string;
  /** `null` = cut-off « à renseigner ». */
  readonly depositDeadline: LocalDeadlineView | null;
  /**
   * Jours ouvrés TARGET2 entre la constitution prévue et la limite de dépôt,
   * quand il y en a MOINS de deux (Hugo, 2026-10-23, plan
   * `plan-page-procedure-de-prelevement.md` § 9) : le délai de
   * pré-notification laisse trop peu de temps pour contrôler et déposer.
   * `null` sinon, ou si la limite n'est pas renseignée. L'écran avertit, il
   * ne refuse rien.
   */
  readonly tightDepositMargin: number | null;
}

/**
 * L'issue d'une tentative de la constitution automatique (plan
 * `prelevement-automatique.md`, PA3). `pending` : prise, issue pas
 * encore écrite — ou le passage s'est interrompu entre les deux. `missed`
 * (R4b) : une clôture antérieure n'a jamais été tentée, rien n'est préparé.
 */
export type CollectionAutopilotOutcomeView =
  "pending" | "constituted" | "nothing_to_collect" | "not_yet_open" | "failed" | "missed";

/** Une tentative de l'automatisme — une par cycle, jamais deux. */
export interface CollectionAutopilotRunView {
  /** ISO — la clôture du cycle tenté. */
  readonly cycleClosesAt: string;
  /** ISO — l'instant de la tentative. */
  readonly ranAt: string;
  readonly outcome: CollectionAutopilotOutcomeView;
  /** Le refus tel quel en `failed`, l'explication sinon ; `null` si rien à dire. */
  readonly message: string | null;
}

/**
 * Ce que le back-office montre d'une **entité juridique émettrice** — nous, pas
 * un client.
 *
 * 🔴 **`creditorIban` n'y figure pas, et `ics` oui.** Les deux sont des
 * coordonnées de notre propre compte, et pourtant ils ne se traitent pas
 * pareil : l'ICS s'imprime sur chaque mandat que des clients signent, donc il
 * est public par destination ; l'IBAN créancier reçoit l'argent, et rien à
 * l'écran n'a besoin de le lire en entier. `creditorAccountLast4` suffit à
 * reconnaître le compte, ce qui est la seule question qu'on se pose devant une
 * fiche.
 */
/**
 * La période close par la dernière clôture du calendrier. Sans les modes :
 * ceux d'un lot sont ceux des clients qu'il prélève (Hugo, 2026-10-12), et
 * la fiche ne lit pas le lot — l'aperçu et le lot constitué les portent.
 */
export interface LastClosurePeriodView {
  /** ISO — `lastClosure`. */
  readonly closesAt: string;
  /** ISO — la clôture précédente du calendrier. */
  readonly startsAt: string;
  /** « du 1er au 4 octobre 2026 » — jours de Paris, dernier jour inclus. */
  readonly label: string;
}

export interface LegalEntityView {
  readonly id: string;
  readonly name: string;
  readonly legalForm: string;
  readonly siren: string;
  readonly vatNumber: string;
  readonly rcs: string;
  readonly shareCapitalCents: number;
  readonly addressLine1: string;
  readonly addressLine2: string;
  readonly postalCode: string;
  readonly city: string;
  readonly countryCode: string;
  /** L'identifiant créancier SEPA, ou `""` tant que la Banque de France ne l'a pas rendu. */
  readonly ics: string;
  /** 4 derniers caractères de l'IBAN créancier, `""` si aucun compte n'est saisi. */
  readonly creditorAccountLast4: string;
  /**
   * Le BIC de notre banque, ou `""`.
   *
   * ⚠️ **Rendu en entier, contrairement à l'IBAN**, et ce n'est pas une entorse :
   * un BIC désigne un établissement, pas un compte. Il figure sur tout virement
   * reçu et s'interroge publiquement — le masquer donnerait l'illusion d'un
   * secret là où il n'y en a pas, et empêcherait de relire une saisie.
   */
  readonly creditorBic: string;
  /**
   * Le bloc recopié du RIB — titulaire et adresse **tels que la banque les
   * connaît**. `""` tant qu'aucun compte n'est saisi.
   *
   * Il redouble `name` et l'adresse du siège, et c'est délibéré : l'un vient du
   * registre, l'autre de la banque. C'est le second qu'un mandat imprime.
   */
  readonly creditorAccountHolder: string;
  readonly creditorAccountLine1: string;
  readonly creditorAccountLine2: string;
  readonly creditorAccountPostalCode: string;
  readonly creditorAccountCity: string;
  readonly creditorAccountCountryCode: string;
  /**
   * 🔴 Le créancier imprimé est-il GELÉ ? Vrai dès le premier mandat frappé.
   *
   * L'écran s'en sert pour refuser le geste AVANT la saisie plutôt qu'après :
   * un formulaire qui accepte puis rend un 409 fait retaper pour rien.
   * ⚠️ Le gel ne porte que sur le titulaire et l'adresse — l'IBAN et le BIC
   * restent modifiables, aucun mandat ne les porte.
   */
  readonly creditorIdentityFrozen: boolean;
  readonly preNotificationDays: number;
  /** La constitution automatique — désactivée par défaut. */
  readonly autoCollectionEnabled: boolean;
  /** Heures entre la clôture et la constitution automatique. */
  readonly autoCollectionDelayHours: number;
  /** N — l'échéance en jours après la clôture ; `null` = le délai de pré-notification. */
  readonly collectionDaysAfterClosure: number | null;
  /** `null` = « à renseigner ». */
  readonly depositCutoff: DepositCutoffView | null;
  /** Les dates des trois modes de facturation (§16), mensuel d'abord. */
  readonly billingModes: readonly LegalEntityBillingModeView[];
  /**
   * ISO — la dernière clôture atteinte du calendrier de l'entité (union des
   * modes en service et du mensuel, §16.3) : celle du lot à préparer.
   */
  readonly lastClosure: string;
  /**
   * La période que ferme `lastClosure` dans ce calendrier — celle du lot à
   * préparer : de la clôture précédente du calendrier (de n'importe quel
   * payeur) à `lastClosure` (M4c, §16.13).
   */
  readonly lastClosurePeriod: LastClosurePeriodView;
  /** Le calendrier du cycle EN COURS, avec les réglages ci-dessus. */
  readonly nextCollection: CollectionCalendarView;
  /**
   * La dernière tentative de la constitution automatique (PA3), ou `null`
   * si elle n'a jamais tenté — activée ou non : une tentative passée reste
   * vraie après qu'on l'a désactivée.
   */
  readonly lastAutopilotRun: CollectionAutopilotRunView | null;
  /**
   * Les mentions de paiement de la facture (plan `facture-emise.md`). Chacune `null` = « à renseigner » : aucune valeur n'est posée d'office.
   */
  readonly invoicePaymentTerms: InvoicePaymentTermsView;
  /**
   * Ce qui manque à CETTE entité pour émettre une facture, déjà rédigé par le
   * domaine (`sellerBlockers`). Vide quand rien ne manque côté vendeur.
   */
  readonly missingToInvoice: readonly string[];
  /**
   * Le préfixe de numéro des factures — le `LFD` de `FA-LFD-2026-000001`
   * (lot ZA) ; `null` tant qu'il n'est pas posé, et l'entité n'émet pas.
   */
  readonly invoicePrefix: string | null;
  /** Vrai dès la première pièce émise : le préfixe ne change plus. */
  readonly invoicePrefixFrozen: boolean;
  /** Zone 20 du mandat — ce que le contrat couvre, en une ligne. */
  readonly mandateContractDescription: string;
  /** Zone 12 du mandat — récurrent, ou ponctuel. */
  readonly mandatePaymentType: MandatePaymentType;
  /**
   * Le schéma des mandats que l'entité frappe désormais. Chaque mandat a figé
   * le sien : ce champ ne dit rien des mandats déjà émis.
   */
  readonly mandateScheme: SepaScheme;
  /** ISO, ou `null` si l'entité est vivante. */
  readonly archivedAt: string | null;
  /**
   * Peut-elle émettre un prélèvement ? La réponse vient de l'agrégat, pas d'un
   * calcul refait à l'écran : la refaire ici serait une seconde définition de
   * « complète », à tenir d'accord avec la première pour toujours.
   */
  readonly canCollect: boolean;
  /**
   * Ce qui lui manque pour encaisser, en clair et déjà rédigé. Vide quand
   * `canCollect` est vrai.
   */
  readonly missingToCollect: readonly string[];
  /**
   * L'entité a-t-elle un logo ?
   *
   * 🔴 **Un booléen, jamais la clé de stockage.** La clé est un détail interne du
   * bucket, et une clé qui SORT d'une API est une clé qu'on finit par accepter en
   * ENTRÉE — c'est-à-dire un appelant qui choisit l'objet qu'il fait servir. Ce
   * que l'écran a besoin de savoir tient dans « il y en a un ou non » ; les
   * octets se demandent par la route dédiée.
   *
   * ⚠️ Le logo ne conditionne PAS `canCollect` : une entité sans logo prélève,
   * son mandat sort seulement sans rond. Il n'apparaît donc pas dans
   * `missingToCollect`.
   */
  readonly hasLogo: boolean;

  /**
   * Cette entité est-elle la **seule en service** ?
   *
   * Un fait sur l'ENSEMBLE, posé sur la vue d'une instance — ce qui se défend
   * pour la même raison que `canCollect` et `missingToCollect` : ce que l'écran
   * doit savoir arrive déjà répondu, et le recalculer côté front ferait une
   * seconde définition de « la dernière », celle que l'utilisateur lit.
   *
   * L'écran s'en sert pour **désactiver** l'archivage : le serveur le refuse en
   * 409, et un bouton dont la seule issue est une erreur est une affordance qui
   * ment.
   */
  readonly isLastActive: boolean;
}

/**
 * Les bornes du **logo de l'entité**, exportées pour que l'écran les énonce sans
 * les réinventer.
 *
 * Le domaine reste l'autorité — `EntityLogo.create` refuse, et c'est lui qu'un
 * test éprouve. Ce qui est ici sert au champ de dépôt et au message d'aide :
 * deux définitions de « format accepté » divergeraient, et celle que
 * l'utilisateur lit serait la moins surveillée.
 */
export const LEGAL_ENTITY_LOGO_MAX_BYTES = 2 * 1024 * 1024;

/**
 * En deçà, le logo est flou à l'impression — et c'est à l'impression qu'on s'en
 * aperçoit, c'est-à-dire sur un document déjà parti chez un client.
 */
export const LEGAL_ENTITY_LOGO_MIN_SIDE = 256;

/**
 * Les types acceptés. Liste d'**acceptation** : ce qui n'y est pas est refusé.
 *
 * Ni PDF (ce n'est pas une image), ni HEIC : `pdfkit` ne sait pas les dessiner,
 * et les accepter produirait un mandat sans logo sans que rien ne le dise.
 */
export const LEGAL_ENTITY_LOGO_ACCEPTED_TYPES = ["image/png", "image/jpeg"] as const;

/** L'adresse du siège, telle qu'elle s'imprime sur un mandat et une facture. */
export const legalAddressPayloadSchema = z.object({
  line1: z.string().trim().min(1),
  line2: z.string().trim().default(""),
  postalCode: z.string().trim().min(1),
  city: z.string().trim().min(1),
  countryCode: z.string().trim().length(2),
});

/**
 * Déclaration d'une entité — **sans coordonnées bancaires**.
 *
 * L'ICS arrive de la Banque de France des semaines après qu'on a saisi la raison
 * sociale. Les exiger ensemble interdirait de préparer le dossier en attendant,
 * ce qui est précisément la période où l'on prépare un dossier.
 */
export const declareLegalEntityPayloadSchema = z.object({
  name: z.string().trim().min(1),
  legalForm: z.string().trim().min(1),
  siren: z.string().trim().min(1),
  rcs: z.string().trim().default(""),
  shareCapitalCents: z.int().nonnegative(),
  vatNumber: z.string().trim().default(""),
  address: legalAddressPayloadSchema,
});
export type DeclareLegalEntityPayload = z.infer<typeof declareLegalEntityPayloadSchema>;

/** Ce qui se corrige librement : les documents déjà émis en ont pris copie. */
export const correctLegalEntityPayloadSchema = z.object({
  name: z.string().trim().min(1),
  legalForm: z.string().trim().min(1),
  rcs: z.string().trim().default(""),
  shareCapitalCents: z.int().nonnegative(),
  vatNumber: z.string().trim().default(""),
  address: legalAddressPayloadSchema,
});
export type CorrectLegalEntityPayload = z.infer<typeof correctLegalEntityPayloadSchema>;

/**
 * L'attribution de l'ICS — **irréversible**, et l'écran doit le dire avant.
 *
 * Une route à part, et pas un champ de la correction : ranger un geste sans
 * retour parmi cinq champs qui se corrigent tous les jours est la façon la plus
 * sûre de le faire poser par mégarde.
 */
export const assignCreditorIdentifierPayloadSchema = z.object({
  ics: z.string().trim().min(1),
});
export type AssignCreditorIdentifierPayload = z.infer<typeof assignCreditorIdentifierPayloadSchema>;

/**
 * Le compte où l'argent arrive. Il change — on peut changer de banque — et c'est
 * ce qui le distingue de l'ICS.
 *
 * L'IBAN monte en clair sur une route staff murée, et **ne redescend jamais** :
 * la vue n'en rend que les quatre derniers caractères. Le BIC, lui, redescend
 * en entier — il désigne une banque, pas un compte.
 *
 * **C'est la recopie d'un RIB en un seul geste** (2026-09-12) : titulaire,
 * adresse, IBAN, BIC. Un compte à moitié rempli ne se découvrirait qu'au rejet
 * du lot, cinq jours après l'envoi.
 *
 * 🔴 Après le premier mandat, le titulaire et l'adresse sont **gelés** — le
 * papier signé les porte. L'IBAN et le BIC, eux, restent libres : aucun mandat
 * ne les porte, donc changer de banque ne contredit aucune signature.
 */
export const setCreditorAccountPayloadSchema = z.object({
  iban: z.string().trim().min(1),
  bic: z.string().trim().min(1),
  holder: z.string().trim().min(1),
  line1: z.string().trim().min(1),
  line2: z.string().trim().default(""),
  postalCode: z.string().trim().min(1),
  city: z.string().trim().min(1),
  countryCode: z.string().trim().length(2).default("FR"),
});
export type SetCreditorAccountPayload = z.infer<typeof setCreditorAccountPayloadSchema>;

/** Le délai annoncé au débiteur entre la notification et le débit, négocié avec la banque. */
/**
 * Les **réglages de mandat** d'une entité — zones 20 et 12 du modèle EPC.
 *
 * 🔴 Sur l'entité et non sur le compte d'un client : ils décrivent **ce que nous
 * vendons**, pas ce que tel client a acheté. La même phrase et le même régime
 * partent sur tous les mandats qu'elle émet — les ressaisir par dossier ferait
 * circuler deux formulations chez des clients voisins, qui se parlent.
 *
 * Ce qui reste par client : le **numéro** de contrat (zone 19) et le code du
 * débiteur (zone 14), qui désignent un dossier précis.
 */
export const mandatePaymentTypeSchema = z.enum(["recurrent", "one_off"]);
export type MandatePaymentType = z.infer<typeof mandatePaymentTypeSchema>;

export const MANDATE_PAYMENT_TYPE_LABELS: Readonly<Record<MandatePaymentType, string>> = {
  recurrent: "Paiement récurrent / répétitif",
  one_off: "Paiement ponctuel",
};

/**
 * Le **schéma SEPA** d'un mandat — `CORE` ou interentreprises (`B2B`).
 *
 * Plan `documentation/comptabilite/mandat/mandat-deux-schemas.md`.
 */
export const sepaSchemeSchema = z.enum(["CORE", "B2B"]);
export type SepaScheme = z.infer<typeof sepaSchemeSchema>;

export const SEPA_SCHEME_LABELS: Readonly<Record<SepaScheme, string>> = {
  CORE: "SEPA CORE",
  B2B: "SEPA interentreprises (B2B)",
};

/**
 * Changer le schéma des frappes à venir.
 *
 * 🔴 **Sans `.default()`, et dans son propre payload** : les réglages de mandat
 * ont des défauts, et un écran ancien qui les enverrait sans ce champ
 * rebasculerait le schéma sans que personne l'ait décidé.
 */
export const setMandateSchemePayloadSchema = z.object({ scheme: sepaSchemeSchema });
export type SetMandateSchemePayload = z.infer<typeof setMandateSchemePayloadSchema>;

/**
 * `GET /admin/accounting/legal-entities/:id/mandate-scheme` — ce qu'une bascule
 * de schéma laisserait derrière elle, **lu avant** de la confirmer.
 *
 * Des comptes, pas des listes (plan mandat deux schémas §3.3) : le dialogue de
 * confirmation dit « 3 brouillons deviendront caducs, 12 mandats actifs gardent
 * leur schéma », et la re-signature des actifs reste un geste staff, dossier
 * par dossier.
 */
export interface MandateSchemeUsageView {
  /** Le schéma sous lequel l'entité frappe aujourd'hui. */
  readonly scheme: SepaScheme;
  /**
   * Les mandats **actifs** émis par l'entité, par schéma figé à leur frappe.
   * Une bascule ne les touche pas : ils gardent le leur jusqu'à remplacement.
   */
  readonly activeByScheme: { readonly CORE: number; readonly B2B: number };
  /** Les brouillons émis par l'entité — ceux qu'une bascule rend caducs. */
  readonly drafts: number;
}

export const setMandateDefaultsPayloadSchema = z.object({
  /**
   * Zone 20. Bornée parce qu'elle s'imprime sur **une** ligne pointillée : un
   * dépassement ne tronque rien, il sort du cadre — et une phrase qui déborde
   * sur un document qu'on fait signer se lit comme un formulaire mal imprimé.
   */
  contractDescription: z.string().trim().max(90).default(""),
  paymentType: mandatePaymentTypeSchema.default("recurrent"),
});
export type SetMandateDefaultsPayload = z.infer<typeof setMandateDefaultsPayloadSchema>;

export const setPreNotificationPayloadSchema = z.object({
  days: z.int().min(PRE_NOTIFICATION_MIN_DAYS).max(PRE_NOTIFICATION_MAX_DAYS),
});
export type SetPreNotificationPayload = z.infer<typeof setPreNotificationPayloadSchema>;

/**
 * Le calendrier de prélèvement de l'entité. La FORME seulement : les bornes et
 * la règle « N ≥ délai de pré-notification » sont opposées par l'agrégat, dont
 * le refus nomme les deux valeurs.
 *
 * Sans `.default()` : un écran ancien qui omettrait un champ ne doit pas
 * remettre une échéance réglée à son défaut sans que personne l'ait décidé.
 */
export const setCollectionSchedulePayloadSchema = z.strictObject({
  delayHours: z.int(),
  daysAfterClosure: z.int().nullable(),
  depositCutoff: z.strictObject({ businessDaysBefore: z.int(), time: z.string() }).nullable(),
});
export type SetCollectionSchedulePayload = z.infer<typeof setCollectionSchedulePayloadSchema>;

/**
 * Les dates d'un mode (`PUT …/billing-modes/:mode`). La FORME seulement : les
 * bornes et le nombre de jours selon le mode sont opposés par le value object,
 * dont le refus dit ce qui a été reçu et ce qui est attendu.
 */
export const setBillingModeDatesPayloadSchema = z.strictObject({
  days: z.array(z.int()),
});
export type SetBillingModeDatesPayload = z.infer<typeof setBillingModeDatesPayloadSchema>;

/** Le mode d'un payeur (`PUT …/payers/:companyId/billing-mode`). */
export const setPayerBillingModePayloadSchema = z.strictObject({
  mode: billingRhythmKindSchema,
});
export type SetPayerBillingModePayload = z.infer<typeof setPayerBillingModePayloadSchema>;

/** Activer ou désactiver la constitution automatique — un geste à part. */
export const setAutoCollectionPayloadSchema = z.strictObject({ enabled: z.boolean() });
export type SetAutoCollectionPayload = z.infer<typeof setAutoCollectionPayloadSchema>;

/**
 * Les bornes des **mentions de paiement de la facture**, recopiées du domaine
 * (`InvoicePaymentTerms`), qui reste l'autorité.
 */
export const LATE_PENALTY_RATE_MIN_BASIS_POINTS = 1;
export const LATE_PENALTY_RATE_MAX_BASIS_POINTS = 10_000;
/**
 * Les points ajoutés au taux BCE par le taux légal par défaut (L441-10, cité
 * de mémoire). L'écran s'en sert pour une SUGGESTION (Q4, 2026-10-08) : le
 * taux BCE varie, il le fait saisir — rien n'est posé d'office.
 */
export const LEGAL_PENALTY_MARGIN_BASIS_POINTS = 1_000;
export const RECOVERY_INDEMNITY_MIN_CENTS = 4_000;
export const RECOVERY_INDEMNITY_MAX_CENTS = 100_000;
export const EARLY_PAYMENT_DISCOUNT_MAX_LENGTH = 200;

/** Les mentions de paiement d'une entité — chacune `null` = « à renseigner ». */
export interface InvoicePaymentTermsView {
  /** Points de base : 1 % = 100. */
  readonly latePenaltyRateBasisPoints: number | null;
  /** Centimes : 40 € = 4000. */
  readonly recoveryIndemnityCents: number | null;
  readonly earlyPaymentDiscount: string | null;
}

/**
 * Régler les mentions de paiement. La FORME seulement — les bornes sont
 * opposées par l'agrégat. Sans `.default()` : un écran ancien qui omettrait un
 * champ ne doit pas effacer une mention réglée.
 */
export const setInvoicePaymentTermsPayloadSchema = z.strictObject({
  latePenaltyRateBasisPoints: z.int().nullable(),
  recoveryIndemnityCents: z.int().nullable(),
  earlyPaymentDiscount: z.string().nullable(),
});
export type SetInvoicePaymentTermsPayload = z.infer<typeof setInvoicePaymentTermsPayloadSchema>;

/**
 * Le préfixe de numéro des factures : 2 à 6 lettres, recopiées du domaine
 * (`InvoicePrefix`), qui reste l'autorité — l'écran s'en sert pour guider.
 */
export const INVOICE_PREFIX_MIN_LENGTH = 2;
export const INVOICE_PREFIX_MAX_LENGTH = 6;

/** Poser le préfixe. La FORME seulement — l'agrégat juge les lettres et le gel. */
export const setInvoicePrefixPayloadSchema = z.strictObject({ prefix: z.string() });
export type SetInvoicePrefixPayload = z.infer<typeof setInvoicePrefixPayloadSchema>;
