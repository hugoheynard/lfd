import { InvalidPurchaseTextError } from "../errors/delivery-purchase-errors.js";
import { PurchasePrice } from "./purchase-price.js";
import { PurchaseUrl } from "./purchase-url.js";

/** Référence et fournisseur : une ligne de catalogue — la borne du contrat, reprise ici. */
export const PURCHASE_TEXT_MAX_LENGTH = 120;

/** Ce que la saisie dit de l'achat d'un candidat. Absent ou `null` = non renseigné. */
export interface PurchaseListingInput {
  readonly reference?: string | null | undefined;
  readonly purchaseUrl?: string | null | undefined;
  readonly priceCentsExclVat?: number | null | undefined;
}

/** Les mêmes, validés et rangés : `null` = non renseigné. */
export interface PurchaseListingState {
  readonly reference: string | null;
  readonly purchaseUrl: string | null;
  readonly priceCentsExclVat: number | null;
}

/**
 * **Où et combien on l'achèterait** — la part commune aux deux candidats
 * (`plan-bibliotheque-d-achat.md`, B-D1, B-D3). Tout est facultatif : un
 * candidat se compare sur ses dimensions avant d'avoir un devis.
 */
export class PurchaseListing {
  private constructor(
    readonly reference: string | null,
    readonly url: PurchaseUrl | null,
    readonly price: PurchasePrice | null,
  ) {}

  /**
   * @throws {InvalidPurchaseTextError} @throws {InvalidPurchaseUrlError}
   * @throws {InvalidPurchasePriceError}
   */
  static of(input: PurchaseListingInput): PurchaseListing {
    const url = optionalText(input.purchaseUrl);
    const price = input.priceCentsExclVat ?? null;
    return new PurchaseListing(
      purchaseTextOf("La référence", input.reference),
      url === null ? null : PurchaseUrl.of(url),
      price === null ? null : PurchasePrice.ofCents(price),
    );
  }

  toState(): PurchaseListingState {
    return {
      reference: this.reference,
      purchaseUrl: this.url?.value ?? null,
      priceCentsExclVat: this.price?.centsExclVat ?? null,
    };
  }
}

/**
 * Un texte libre facultatif, rogné ; vide = non renseigné — l'écran envoie
 * une case vidée, pas un `null`.
 *
 * @throws {InvalidPurchaseTextError} au-delà de {@link PURCHASE_TEXT_MAX_LENGTH}.
 */
export function purchaseTextOf(label: string, raw: string | null | undefined): string | null {
  const text = optionalText(raw);
  if (text !== null && text.length > PURCHASE_TEXT_MAX_LENGTH) {
    throw new InvalidPurchaseTextError(label, PURCHASE_TEXT_MAX_LENGTH);
  }
  return text;
}

function optionalText(raw: string | null | undefined): string | null {
  const text = raw?.trim() ?? "";
  return text.length === 0 ? null : text;
}
