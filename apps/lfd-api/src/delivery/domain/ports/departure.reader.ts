/** Port de **lecture** du départ choisi — l'identifiant opaque, ou `null` si personne n'a choisi. */
export abstract class DepartureReader {
  abstract chosenPickupAddressId(): Promise<string | null>;
}
