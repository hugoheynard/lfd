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
   * Persiste l'état d'un agrégat chargé — il prend l'agrégat, jamais des
   * colonnes.
   *
   * Le **KBIS** y est entré le 2026-09-03. Il avait deux écritures ciblées
   * (`saveKbisMetadata`, `saveKbisCertification`) au motif qu'il était « couplé
   * au stockage objet ». Le couplage est dans le handler, qui range le fichier
   * dans R2 avant d'écrire quoi que ce soit ; ce que les écritures ciblées
   * emportaient vraiment, c'était la seule règle du KBIS — un nouveau fichier
   * n'est jamais certifié — appliquée par l'adaptateur Prisma en remettant
   * quatre colonnes à `null`.
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
   * Où lire le KBIS pour le télécharger, ou `null` s'il n'y en a pas.
   *
   * Read **étroit**, et il reste séparé de l'agrégat exprès : servir un fichier
   * n'a pas besoin de charger une société entière, et la clé de stockage comme
   * le `contentType` sont des détails d'infrastructure — ils n'ont jamais
   * traversé la vue `/me`.
   */
  abstract kbisLocation(companyId: string): Promise<KbisLocation | null>;
}

/** De quoi servir le fichier au téléchargement. */
export interface KbisLocation {
  readonly storageKey: string;
  readonly fileName: string;
  readonly contentType: string;
}
