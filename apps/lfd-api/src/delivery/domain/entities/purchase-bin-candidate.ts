import { InvalidPurchaseCandidateNameError } from "../errors/delivery-purchase-errors.js";
import { BinFormat } from "../value-objects/bin-format.js";
import type { BinTypeDimensionsInput } from "../value-objects/bin-type-dimensions.js";
import {
  PurchaseListing,
  type PurchaseListingState,
  purchaseTextOf,
} from "../value-objects/purchase-listing.js";
import type { DeliveryAuthor } from "./departure-choice.js";
import {
  PurchaseCandidateLifecycle,
  type PurchaseCandidateLifecycleState,
} from "./purchase-candidate-lifecycle.js";
import { PURCHASE_CANDIDATE_NAME_MAX_LENGTH } from "./purchase-vehicle-candidate.js";

/**
 * Ce qu'une déclaration ou une correction dit d'un format candidat — la fiche
 * COMPLÈTE. Le prix est UNITAIRE (B-Q2) : un lot vendu par dix se note en
 * référence, il ne change pas l'unité.
 */
export interface PurchaseBinCandidateSpec {
  readonly name: string;
  readonly outer: BinTypeDimensionsInput;
  readonly inner: BinTypeDimensionsInput;
  readonly isotherm: boolean;
  readonly maxStack: number;
  readonly supplier?: string | null | undefined;
  readonly reference?: string | null | undefined;
  readonly purchaseUrl?: string | null | undefined;
  readonly unitPriceCentsExclVat?: number | null | undefined;
}

/** La fiche telle qu'elle se range et se journalise : tout est explicite. */
export interface PurchaseBinCandidateSheet {
  readonly name: string;
  readonly outer: BinTypeDimensionsInput;
  readonly inner: BinTypeDimensionsInput;
  readonly isotherm: boolean;
  readonly maxStack: number;
  readonly supplier: string | null;
  readonly reference: string | null;
  readonly purchaseUrl: string | null;
  readonly unitPriceCentsExclVat: number | null;
}

/** L'état persisté — ce que `toDomain` réhydrate. */
export interface PurchaseBinCandidateState
  extends PurchaseBinCandidateSheet, PurchaseCandidateLifecycleState {
  readonly id: string;
}

interface ValidSheet {
  readonly name: string;
  readonly format: BinFormat;
  readonly isotherm: boolean;
  readonly supplier: string | null;
  readonly listing: PurchaseListing;
}

/**
 * **Un format de bac candidat** de la bibliothèque d'achat
 * (`documentation/livraisons/chargement/plan-bibliotheque-d-achat.md`, B-D1, lot B1) :
 * un bac qu'on envisage d'acheter. Ce n'est PAS un `BinType` — il n'a ni
 * contenance ni colisage, et vit dans sa propre table. Sa géométrie obéit
 * pourtant aux règles d'un type de bac, par `BinFormat` : bornes, intérieur
 * dans l'extérieur, pile — et ses dimensions se mesurent au millimètre, comme
 * lui (2026-10-07).
 */
export class PurchaseBinCandidate {
  private constructor(
    readonly id: string,
    private sheet: ValidSheet,
    private readonly lifecycle: PurchaseCandidateLifecycle,
  ) {}

  /**
   * @throws {InvalidPurchaseCandidateNameError} @throws {InvalidBinDimensionsError}
   * @throws {BinInnerExceedsOuterError} @throws {InvalidBinMaxStackError}
   * @throws {InvalidPurchaseTextError} @throws {InvalidPurchaseUrlError}
   * @throws {InvalidPurchasePriceError}
   */
  static declare(
    input: PurchaseBinCandidateSpec & {
      readonly id: string;
      readonly at: Date;
      readonly author: DeliveryAuthor;
    },
  ): PurchaseBinCandidate {
    return new PurchaseBinCandidate(
      input.id,
      validSheetOf(input),
      PurchaseCandidateLifecycle.begin("bin", input.at, input.author),
    );
  }

  /** Réhydrate un candidat lu en base ; la fiche se revalide. */
  static restore(state: PurchaseBinCandidateState): PurchaseBinCandidate {
    return new PurchaseBinCandidate(
      state.id,
      validSheetOf(state),
      PurchaseCandidateLifecycle.restore("bin", state),
    );
  }

  get name(): string {
    return this.sheet.name;
  }

  get format(): BinFormat {
    return this.sheet.format;
  }

  get listing(): PurchaseListing {
    return this.sheet.listing;
  }

  get archivedAt(): Date | null {
    return this.lifecycle.archivedAt;
  }

  get inLibrary(): boolean {
    return this.lifecycle.inLibrary;
  }

  /** La fiche entière, explicite — l'« avant » et l'« après » du journal. */
  get specification(): PurchaseBinCandidateSheet {
    const { format, listing } = this.sheet;
    const listed: PurchaseListingState = listing.toState();
    return {
      name: this.sheet.name,
      outer: format.outer.toInput(),
      inner: format.inner.toInput(),
      isotherm: this.sheet.isotherm,
      maxStack: format.maxStack,
      supplier: this.sheet.supplier,
      reference: listed.reference,
      purchaseUrl: listed.purchaseUrl,
      unitPriceCentsExclVat: listed.priceCentsExclVat,
    };
  }

  /** Corrige la fiche ENTIÈRE ; permis sur un candidat archivé. Tout est validé d'abord. */
  correct(spec: PurchaseBinCandidateSpec, at: Date, author: DeliveryAuthor): void {
    this.sheet = validSheetOf(spec);
    this.lifecycle.touch(at, author);
  }

  /** @throws {PurchaseCandidateAlreadyArchivedError} */
  archive(at: Date, author: DeliveryAuthor): void {
    this.lifecycle.archive(this.sheet.name, at, author);
  }

  /** @throws {PurchaseCandidateNotArchivedError} */
  reactivate(at: Date, author: DeliveryAuthor): void {
    this.lifecycle.reactivate(this.sheet.name, at, author);
  }

  toState(): PurchaseBinCandidateState {
    return { id: this.id, ...this.specification, ...this.lifecycle.toState() };
  }
}

/**
 * @throws {InvalidPurchaseCandidateNameError} @throws {InvalidBinDimensionsError}
 * @throws {BinInnerExceedsOuterError} @throws {InvalidBinMaxStackError}
 * @throws {InvalidPurchaseTextError} @throws {InvalidPurchaseUrlError}
 * @throws {InvalidPurchasePriceError}
 */
function validSheetOf(input: PurchaseBinCandidateSpec): ValidSheet {
  const name = input.name.trim();
  if (name.length === 0 || name.length > PURCHASE_CANDIDATE_NAME_MAX_LENGTH) {
    throw new InvalidPurchaseCandidateNameError("bin", PURCHASE_CANDIDATE_NAME_MAX_LENGTH);
  }
  return {
    name,
    format: BinFormat.of(input),
    isotherm: input.isotherm,
    supplier: purchaseTextOf("Le fournisseur", input.supplier),
    listing: PurchaseListing.of({
      reference: input.reference,
      purchaseUrl: input.purchaseUrl,
      priceCentsExclVat: input.unitPriceCentsExclVat,
    }),
  };
}
