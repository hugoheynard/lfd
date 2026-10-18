import {
  VitrineEndpointCarriesSecretError,
  VitrineEndpointInvalidError,
  VitrineEndpointNotHttpsError,
} from "./errors/vitrine-errors.js";

/** Au-delà, ce n'est plus une adresse qu'on saisit : c'est un collage raté. */
const MAX_LENGTH = 2048;

/**
 * **L'adresse d'un abonné** — `https` seul, sans requête, fragment ni
 * identifiants (plan vitrine, M1 et SSRF).
 *
 * Elle ne dit rien de l'ADRESSE IP : une vérification à la saisie serait
 * contournée par un changement de DNS. C'est le relais sortant qui refuse,
 * au moment de l'envoi, une adresse résolue privée ou de bouclage.
 */
export class VitrineEndpoint {
  private constructor(readonly value: string) {}

  /**
   * @throws {VitrineEndpointInvalidError} pas une URL.
   * @throws {VitrineEndpointNotHttpsError} un autre protocole que `https`.
   * @throws {VitrineEndpointCarriesSecretError} une requête, un fragment ou des identifiants.
   */
  static of(raw: string): VitrineEndpoint {
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.length > MAX_LENGTH) {
      throw new VitrineEndpointInvalidError();
    }
    const url = parsed(trimmed);
    if (url.protocol !== "https:") {
      throw new VitrineEndpointNotHttpsError();
    }
    // `URL` efface un `?` ou un `#` vides : on lit la saisie, pas seulement l'analyse.
    const carriesSecret =
      trimmed.includes("?") || trimmed.includes("#") || url.username !== "" || url.password !== "";
    if (carriesSecret) {
      throw new VitrineEndpointCarriesSecretError();
    }
    return new VitrineEndpoint(url.toString());
  }
}

function parsed(raw: string): URL {
  try {
    const url = new URL(raw);
    if (url.hostname === "") {
      throw new VitrineEndpointInvalidError();
    }
    return url;
  } catch {
    throw new VitrineEndpointInvalidError();
  }
}
