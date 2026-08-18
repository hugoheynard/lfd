import type { Company } from "../entities/company.js";

/** Port d'**écriture** des sociétés. */
export abstract class CompanyRepository {
  /** Vrai si une société porte déjà ce SIRET (forme normalisée, 14 chiffres). */
  abstract existsBySiret(siret: string): Promise<boolean>;

  /**
   * Charge l'agrégat société (identité + contact principal), ou `null` s'il
   * n'existe pas. **Sans mur** : le mur (membership/rôle) est vérifié en amont par
   * le handler ; ici on ne fait que reconstituer l'agrégat à muter.
   */
  abstract load(companyId: string): Promise<Company | null>;

  /**
   * Persiste l'état **souple** d'un agrégat chargé (identité souple + contact) —
   * il prend l'agrégat, jamais des colonnes. Le statut, les termes et le KBIS ont
   * leurs propres transitions (méthodes ci-dessous) tant que Company ne les porte
   * pas encore.
   */
  abstract save(company: Company): Promise<void>;

  /**
   * Enregistre une société déclarée **et** rattache son créateur comme
   * gestionnaire, en **une seule** opération atomique.
   *
   * Les deux écritures ne sont pas séparables : une société sans aucun membre
   * n'appartiendrait à personne — plus aucun client ne pourrait la voir ni la
   * compléter, et elle resterait invisible dans « Mes entreprises ». C'est
   * pourquoi le port expose cette intention entière plutôt qu'un `insert` et un
   * `attach` que l'appelant pourrait dissocier.
   *
   * @returns l'identifiant de la société créée.
   */
  abstract declareOwnedBy(company: Company, ownerUserId: string): Promise<string>;

  /**
   * Enregistre une société déclarée **par le staff**, **sans** propriétaire ni
   * membership. À l'inverse de {@link declareOwnedBy}, la peur « société sans
   * membre invisible » ne s'applique pas : cette société n'est pas destinée à
   * « Mes entreprises » d'un client, elle est **gérée par le staff** (lecture
   * cross-tenant) jusqu'à ce qu'un client la **réclame** (invitation, à venir).
   *
   * @returns l'identifiant de la société créée.
   */
  abstract declareUnowned(company: Company): Promise<string>;

  /**
   * Enregistre les métadonnées du KBIS déposé (le fichier, lui, est dans R2), et
   * **remet la certification à zéro** : un nouveau fichier n'est jamais certifié
   * tant que le staff ne l'a pas revalidé.
   */
  abstract saveKbisMetadata(companyId: string, meta: KbisMetadata): Promise<void>;

  /**
   * Où lire le KBIS pour le télécharger, ou `null` s'il n'y en a pas. Read
   * étroit, compagnon direct de l'écriture ci-dessus — la clé de stockage et le
   * `contentType` sont des détails infra, absents de la vue `/me`.
   */
  abstract kbisLocation(companyId: string): Promise<KbisLocation | null>;

  /**
   * Pose — ou retire (`null`) — la **certification** du KBIS déposé.
   *
   * Certifier n'est pas une donnée saisie : c'est un agent qui a ouvert
   * l'extrait, l'a comparé à ce qui est enregistré, et engage sa parole. D'où la
   * trace jointe, et d'où le retrait possible : un clic de trop doit pouvoir se
   * défaire, sinon personne n'osera cliquer.
   */
  abstract saveKbisCertification(
    companyId: string,
    certification: KbisCertification | null,
  ): Promise<void>;
}

/** Qui a certifié, et quand. Le nom et le titre sont figés à cet instant. */
export interface KbisCertification {
  readonly at: Date;
  /** Le `sub` du token staff — l'identifiant qui survit à un changement de nom. */
  readonly bySub: string;
  /** Instantané du nom d'usage, vide si le `sub` n'est dans aucune fiche. */
  readonly byName: string;
  /** Instantané du périmètre, vide de même. */
  readonly byRole: string;
}

/** Métadonnées d'un KBIS déposé (le fichier vit dans le stockage objet). */
export interface KbisMetadata {
  readonly storageKey: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly size: number;
}

/** De quoi servir le fichier au téléchargement. */
export interface KbisLocation {
  readonly storageKey: string;
  readonly fileName: string;
  readonly contentType: string;
}
