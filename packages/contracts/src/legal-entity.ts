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
  readonly preNotificationDays: number;
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
 * la vue n'en rend que les quatre derniers caractères.
 */
export const setCreditorAccountPayloadSchema = z.object({
  iban: z.string().trim().min(1),
});
export type SetCreditorAccountPayload = z.infer<typeof setCreditorAccountPayloadSchema>;

/** Le délai annoncé au débiteur entre la notification et le débit, négocié avec la banque. */
export const setPreNotificationPayloadSchema = z.object({
  days: z.int().min(PRE_NOTIFICATION_MIN_DAYS).max(PRE_NOTIFICATION_MAX_DAYS),
});
export type SetPreNotificationPayload = z.infer<typeof setPreNotificationPayloadSchema>;
