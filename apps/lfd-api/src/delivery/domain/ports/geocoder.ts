import type { GeoPoint } from "../value-objects/geo-point.js";

/** Une adresse à géocoder, repérée par sa clé normalisée. */
export interface GeocodeRequest {
  readonly key: string;
  /** La voie (numéro et rue). */
  readonly street: string;
  readonly postalCode: string;
  readonly city: string;
}

/** Ce que le géocodeur a rendu ; `point` nul quand il n'a rien trouvé d'assez sûr. */
export interface GeocodeAnswer {
  readonly key: string;
  readonly point: GeoPoint | null;
  /** La confiance du géocodeur, entre 0 et 1. */
  readonly score: number;
}

/**
 * **Port du géocodage** (L7-C9) — déclaré par la livraison, implémenté dans son
 * infrastructure (la Base Adresse Nationale). Un APPEL RÉSEAU : il ne se fait
 * que dans « Situer les arrêts », jamais dans « Proposer », et jamais dans une
 * transaction.
 *
 * @throws {GeocoderDisabledError} aucun géocodeur n'est configuré.
 * @throws {GeocoderUnavailableError} le service n'a pas répondu, ou mal.
 */
export abstract class Geocoder {
  abstract geocode(requests: readonly GeocodeRequest[]): Promise<readonly GeocodeAnswer[]>;
}
