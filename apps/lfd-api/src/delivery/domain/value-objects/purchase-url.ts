import { InvalidPurchaseUrlError } from "../errors/delivery-purchase-errors.js";

/** La borne du contrat (`PURCHASE_URL_MAX_LENGTH`), reprise ici. */
export const PURCHASE_URL_MAX_LENGTH = 2000;

const HTTPS = "https:";

/**
 * **Un lien d'achat** (`plan-bibliotheque-d-achat.md`, B-D3) : c'est un lien
 * qu'on OUVRE depuis le back-office. Seul `https:` est admis — un `http:` se
 * lit en clair, un `javascript:` ou un `data:` s'exécute au clic. On refuse
 * aussi un identifiant dans l'adresse (`https://nom:secret@…`), qui n'a rien à
 * faire dans une fiche lue par toute l'équipe.
 *
 * Le lien est rangé tel que l'analyseur l'a normalisé : c'est cette forme que
 * le navigateur ouvrira.
 */
export class PurchaseUrl {
  private constructor(readonly value: string) {}

  /** @throws {InvalidPurchaseUrlError} */
  static of(raw: string): PurchaseUrl {
    const trimmed = raw.trim();
    if (trimmed.length > PURCHASE_URL_MAX_LENGTH) {
      throw new InvalidPurchaseUrlError(`l'adresse dépasse ${PURCHASE_URL_MAX_LENGTH} caractères`);
    }
    const url = parsed(trimmed);
    if (url.protocol !== HTTPS) {
      throw new InvalidPurchaseUrlError(
        `seules les adresses https:// sont admises, celle-ci commence par « ${url.protocol} »`,
      );
    }
    if (url.username !== "" || url.password !== "") {
      throw new InvalidPurchaseUrlError("l'adresse contient un identifiant ou un mot de passe");
    }
    if (url.hostname === "") {
      throw new InvalidPurchaseUrlError("l'adresse ne nomme aucun site");
    }
    return new PurchaseUrl(url.href);
  }
}

/** @throws {InvalidPurchaseUrlError} ce n'est pas une adresse du tout. */
function parsed(raw: string): URL {
  if (!URL.canParse(raw)) {
    throw new InvalidPurchaseUrlError("ce n'est pas une adresse web complète");
  }
  return new URL(raw);
}
