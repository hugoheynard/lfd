import { z } from "zod";

/**
 * Les bornes du **délai de pré-notification**, recopiées du domaine.
 *
 * Le domaine reste l'autorité : `LegalEntity.setPreNotificationDays` refuse tout
 * ce qui sort de ces bornes, et c'est lui qu'un test éprouve. Ce qui est ici sert
 * au champ de saisie — un écran qui laisse taper 400 pour se faire répondre non
 * par le serveur est un écran qui fait perdre une saisie.
 */
export const PRE_NOTIFICATION_MIN_DAYS = 1;
export const PRE_NOTIFICATION_MAX_DAYS = 60;

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
 * Plan `documentation/b2b/plan-mandat-deux-schemas.md`.
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
