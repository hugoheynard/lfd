import { GeocoderDisabledError } from "../domain/errors/delivery-routing-errors.js";
import { type GeocodeAnswer, Geocoder } from "../domain/ports/geocoder.js";

/**
 * **Aucun géocodeur configuré** (L7-C9) : sans URL dans `AppConfig`, « Situer »
 * refuse en le disant, et les points ne viennent que du carnet. C'est le cas
 * des e2e — le harnais ne double qu'Auth0, et un e2e ne sort pas sur le réseau.
 */
export class DisabledGeocoder extends Geocoder {
  geocode(): Promise<readonly GeocodeAnswer[]> {
    return Promise.reject(new GeocoderDisabledError());
  }
}
