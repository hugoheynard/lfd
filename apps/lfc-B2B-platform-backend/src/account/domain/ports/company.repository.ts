import type { Company } from "../entities/company.js";
import type { ContactDetails } from "../value-objects/contact-details.js";

/** Port d'**écriture** des sociétés. */
export abstract class CompanyRepository {
  /** Vrai si une société porte déjà ce SIRET (forme normalisée, 14 chiffres). */
  abstract existsBySiret(siret: string): Promise<boolean>;

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
   * Remplace le contact **principal** de l'entreprise (la carte « Admin du compte
   * entreprise »). Contact aplati sur la société, toujours présent — on le met à
   * jour, on ne le supprime jamais.
   */
  abstract updatePrimaryContact(companyId: string, details: ContactDetails): Promise<void>;

  /** Enregistre les métadonnées du KBIS déposé (le fichier, lui, est dans R2). */
  abstract saveKbisMetadata(companyId: string, meta: KbisMetadata): Promise<void>;

  /**
   * Où lire le KBIS pour le télécharger, ou `null` s'il n'y en a pas. Read
   * étroit, compagnon direct de l'écriture ci-dessus — la clé de stockage et le
   * `contentType` sont des détails infra, absents de la vue `/me`.
   */
  abstract kbisLocation(companyId: string): Promise<KbisLocation | null>;
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
