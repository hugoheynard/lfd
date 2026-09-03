import type { DeliveryAddressPayload, DeliverySpecs } from "@lfd/contracts";

import { CompanyAddressNotFoundError } from "../errors/account-errors.js";

/**
 * Les lignes postales d'une adresse. La **forme** est déjà garantie à la
 * frontière par `postalFieldsSchema` (ligne1, code postal, ville et pays non
 * vides) : l'agrégat ne la revalide pas, il ne porte que les règles que Zod ne
 * peut pas voir — celles qui parlent du carnet, pas d'une ligne isolée.
 */
export interface PostalLines {
  readonly label: string;
  readonly ligne1: string;
  readonly ligne2: string;
  readonly codePostal: string;
  readonly ville: string;
  readonly pays: string;
}

/** Une adresse de livraison telle que le carnet la porte. */
export interface DeliveryAddress {
  readonly id: string;
  readonly lines: PostalLines;
  readonly specs: DeliverySpecs;
  readonly createdAt: Date;
  /** `null` tant qu'elle est au carnet. Jamais de DELETE physique. */
  readonly archivedAt: Date | null;
}

/** De quoi rehydrater le carnet depuis la base. */
export interface ReconstituteBookInput {
  readonly companyId: string;
  readonly entries: readonly DeliveryAddress[];
  readonly defaultId: string | null;
}

/** L'état complet du carnet, tel que l'adaptateur doit l'écrire. */
export interface DeliveryBookState {
  readonly companyId: string;
  /** Toutes les entrées, archivées comprises — l'adaptateur écrit l'ensemble. */
  readonly entries: readonly DeliveryAddress[];
  /** L'unique adresse par défaut, ou `null` si le carnet est vide. */
  readonly defaultId: string | null;
}

/**
 * **Le carnet d'adresses de livraison d'une entreprise.**
 *
 * L'agrégat existe pour une seule raison : « exactement une adresse par défaut »
 * est une règle du **carnet**, pas d'une adresse. Tant qu'elle vivait dans un
 * `isDefault` par ligne, elle ne pouvait qu'être *vérifiée* — par quatre méthodes
 * SQL qui démotaient les autres lignes à la main, chacune pouvant oublier.
 *
 * Ici elle n'est plus vérifiée : elle est **inexprimable**. Le défaut est un
 * `defaultId` unique porté par le carnet, donc deux adresses par défaut n'ont
 * pas de représentation. Ce que le code ne peut pas dire, aucune revue n'a à le
 * relire.
 *
 * Les quatre autres règles, elles, restent des règles — et sont ici :
 *
 * - la **première** livraison devient le défaut, qu'elle le demande ou non ;
 * - une **modification** peut promouvoir, jamais rétrograder (rétrograder sans
 *   désigner de remplaçante laisserait le carnet sans défaut) ;
 * - **archiver** le défaut promeut la plus ancienne restante ;
 * - archiver la **dernière** laisse un carnet sans défaut, et c'est légitime :
 *   c'est le seul état où `defaultId` vaut `null`.
 *
 * ⚠️ **Pourquoi le cycle charger → muter → écrire est sûr ici**, alors qu'il ne
 * l'est pas pour `OrderRepository.markPaid` : deux gestionnaires qui désignent
 * chacun un défaut au même instant produisent, dans les deux ordres possibles,
 * un carnet à **un** défaut. Le dernier écrivain gagne, et l'invariant tient. Un
 * règlement Stripe, lui, doit refuser la seconde transition — d'où l'écriture
 * conditionnelle en base à cet endroit-là, et pas ici.
 */
export class DeliveryAddressBook {
  private constructor(
    private readonly companyIdValue: string,
    private readonly entries: BookEntry[],
    private defaultIdValue: string | null,
  ) {}

  /** Rehydrate le carnet depuis la base. */
  static reconstitute(input: ReconstituteBookInput): DeliveryAddressBook {
    const entries = input.entries.map((entry) => ({ ...entry }));
    const book = new DeliveryAddressBook(input.companyId, entries, input.defaultId);
    // Un carnet lu peut arriver bancal — il a été écrit par l'ancien modèle, où
    // rien n'empêchait un défaut archivé ou aucun défaut du tout. On le redresse
    // à la lecture plutôt que de propager l'incohérence dans les écrans.
    book.settleDefault();
    return book;
  }

  /** L'entreprise à qui ce carnet appartient — le mur. */
  companyId(): string {
    return this.companyIdValue;
  }

  /** Les adresses encore au carnet, la plus ancienne d'abord. */
  deliveries(): readonly DeliveryAddress[] {
    return this.active().map((entry) => ({ ...entry }));
  }

  /** L'adresse par défaut, ou `null` quand le carnet est vide. */
  defaultId(): string | null {
    return this.defaultIdValue;
  }

  /**
   * Ajoute une adresse. L'identifiant vient de l'`IdGenerator` et l'instant du
   * `Clock` : l'agrégat ne fabrique ni l'un ni l'autre (§3.2).
   *
   * Elle devient le défaut si elle le demande — ou si le carnet était vide, car
   * un carnet non vide sans défaut n'a pas de sens pour la suite.
   */
  add(id: string, payload: DeliveryAddressPayload, createdAt: Date): void {
    const first = this.active().length === 0;
    this.entries.push({
      id,
      lines: linesOf(payload),
      specs: payload.specs,
      createdAt,
      archivedAt: null,
    });
    if (payload.isDefault || first) {
      this.defaultIdValue = id;
    }
  }

  /**
   * Remplace une adresse du carnet.
   *
   * La charge ne peut que **promouvoir** : `isDefault: false` sur l'adresse par
   * défaut ne la rétrograde pas. Rétrograder sans désigner de remplaçante
   * laisserait le carnet sans défaut — on retire un défaut en en donnant un
   * autre, jamais en enlevant celui-là.
   *
   * @throws {CompanyAddressNotFoundError} l'adresse n'est pas à ce carnet.
   */
  edit(addressId: string, payload: DeliveryAddressPayload): void {
    const entry = this.require(addressId);
    entry.lines = linesOf(payload);
    entry.specs = payload.specs;
    if (payload.isDefault) {
      this.defaultIdValue = addressId;
    }
  }

  /**
   * Archive une adresse. Si c'était le défaut, la plus ancienne restante prend
   * la place — et si aucune ne reste, le carnet se retrouve sans défaut, ce qui
   * est le seul état où c'est correct.
   *
   * @throws {CompanyAddressNotFoundError} l'adresse n'est pas à ce carnet.
   */
  archive(addressId: string, at: Date): void {
    const entry = this.require(addressId);
    entry.archivedAt = at;
    this.settleDefault();
  }

  /**
   * Désigne l'adresse par défaut.
   *
   * @throws {CompanyAddressNotFoundError} l'adresse n'est pas à ce carnet.
   */
  makeDefault(addressId: string): void {
    this.require(addressId);
    this.defaultIdValue = addressId;
  }

  /**
   * L'adresse `addressId` est-elle encore au carnet ? Sert au handler à savoir
   * si la **préférence de livraison** de la société vient de désigner le vide :
   * `Company` porte cette préférence, ce carnet ne la connaît pas, et deux
   * agrégats se coordonnent par leur handler — jamais en s'important l'un l'autre.
   */
  holds(addressId: string): boolean {
    return this.active().some((entry) => entry.id === addressId);
  }

  /** L'état à écrire — les archivées comprises, l'adaptateur écrit l'ensemble. */
  toPersistence(): DeliveryBookState {
    return {
      companyId: this.companyIdValue,
      entries: this.entries.map((entry) => ({ ...entry })),
      defaultId: this.defaultIdValue,
    };
  }

  /** Les entrées encore au carnet, la plus ancienne d'abord. */
  private active(): BookEntry[] {
    return this.entries
      .filter((entry) => entry.archivedAt === null)
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  }

  /** L'entrée visée, ou l'absence — une adresse archivée est déjà absente. */
  private require(addressId: string): BookEntry {
    const entry = this.active().find((candidate) => candidate.id === addressId);
    if (entry === undefined) {
      throw new CompanyAddressNotFoundError(addressId);
    }
    return entry;
  }

  /** Ramène `defaultId` sur une adresse vivante : la plus ancienne à défaut. */
  private settleDefault(): void {
    const active = this.active();
    if (active.some((entry) => entry.id === this.defaultIdValue)) {
      return;
    }
    this.defaultIdValue = active[0]?.id ?? null;
  }
}

/** L'entrée telle que l'agrégat la mute — les lignes et les consignes changent. */
interface BookEntry {
  readonly id: string;
  lines: PostalLines;
  specs: DeliverySpecs;
  readonly createdAt: Date;
  archivedAt: Date | null;
}

/** Les seules colonnes postales, extraites d'une charge validée. */
function linesOf(payload: DeliveryAddressPayload): PostalLines {
  return {
    label: payload.label,
    ligne1: payload.ligne1,
    ligne2: payload.ligne2,
    codePostal: payload.codePostal,
    ville: payload.ville,
    pays: payload.pays,
  };
}
