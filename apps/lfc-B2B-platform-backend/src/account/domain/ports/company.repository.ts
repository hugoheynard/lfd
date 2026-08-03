import type { PaymentTerm } from "../ports/account.reader.js";
import type { Company } from "../entities/company.js";
import type { ContactDetails } from "../value-objects/contact-details.js";

/** Identité **souple** éditable : enseigne + n° de TVA. */
export interface EditableIdentity {
  readonly enseigne: string;
  readonly tvaIntracom: string;
}

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
   * Remplace le contact **principal** de l'entreprise (la carte « Admin du compte
   * entreprise »). Contact aplati sur la société, toujours présent — on le met à
   * jour, on ne le supprime jamais.
   */
  abstract updatePrimaryContact(companyId: string, details: ContactDetails): Promise<void>;

  /** Édite l'identité souple (enseigne + n° de TVA). L'identité légale reste fixée. */
  abstract updateIdentity(companyId: string, identity: EditableIdentity): Promise<void>;

  /**
   * Passe la société à `active` et **pose `activatedAt`** (activation commerciale
   * explicite). Écriture nue : le gate (pièces requises présentes, statut
   * `pending`) est vérifié en amont par le handler, pas ici.
   */
  abstract markActive(companyId: string): Promise<void>;

  /**
   * Enregistre la condition de règlement **demandée** par le client (colonne
   * `requested_payment_term`) : une demande, pas le terme convenu — que seul le
   * staff écrit. `null` retire la demande en cours (souhait retiré).
   */
  abstract requestPaymentTerm(companyId: string, term: PaymentTerm | null): Promise<void>;

  /**
   * Fixe la condition de règlement **convenue** (colonne `payment_term`) —
   * réservé au **staff** (Porte B). Écrire le terme convenu **solde** la demande
   * en cours (`requested_payment_term` remis à `null`) : le commercial a tranché,
   * il n'y a plus rien « en attente » à afficher côté client.
   */
  abstract setAgreedPaymentTerm(companyId: string, term: PaymentTerm): Promise<void>;

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
