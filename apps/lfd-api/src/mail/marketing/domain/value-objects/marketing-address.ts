import { InvalidMarketingPreferenceError } from "../errors/marketing-preference.errors.js";

/** La longueur d'une adresse, comme `mail_request.recipient`. */
const KEY_MAX = 320;
/** `HMAC-SHA256` en hexadécimal. */
const PRINT_PATTERN = /^[0-9a-f]{64}$/u;

/**
 * La clé d'une adresse : la même règle que `MailRequest` (blancs retirés,
 * minuscules), pour qu'un envoi et le registre comparent la même chose.
 */
export function marketingKeyOf(address: string): string {
  return address.trim().toLowerCase();
}

/**
 * **Une adresse, telle que le registre la range** : sa clé en clair et son
 * empreinte à clé, qui survit à l'effacement (contradiction de vitruve,
 * « l'effacement ne rouvre pas la porte »). L'empreinte est calculée par un
 * port (la clé est un secret serveur) ; ce value object vérifie sa forme.
 */
export class MarketingAddress {
  private constructor(
    readonly key: string,
    readonly print: string,
  ) {}

  static of(key: string, print: string): MarketingAddress {
    if (key.length === 0 || key.length > KEY_MAX) {
      throw new InvalidMarketingPreferenceError(
        "l'adresse",
        `doit compter 1 à ${KEY_MAX} caractères`,
      );
    }
    if (key !== marketingKeyOf(key)) {
      throw new InvalidMarketingPreferenceError("l'adresse", "n'est pas normalisée");
    }
    if (!PRINT_PATTERN.test(print)) {
      throw new InvalidMarketingPreferenceError(
        "l'empreinte",
        "n'est pas un HMAC-SHA256 hexadécimal",
      );
    }
    return new MarketingAddress(key, print);
  }
}
