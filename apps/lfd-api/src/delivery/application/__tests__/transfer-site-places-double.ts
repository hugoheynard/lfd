import { type TransferSitePlace, TransferSitePlacesReader } from "../../channels/commerce/index.js";

/** Le lieu des sites, donné d'avance ; retient les sites demandés. */
export class FixedTransferSitePlaces extends TransferSitePlacesReader {
  readonly asked: (readonly string[])[] = [];

  constructor(private readonly places: readonly TransferSitePlace[] = []) {
    super();
  }

  placesOf(siteIds: readonly string[]): Promise<ReadonlyMap<string, TransferSitePlace>> {
    this.asked.push(siteIds);
    return Promise.resolve(
      new Map(
        this.places
          .filter((place) => siteIds.includes(place.siteId))
          .map((place) => [place.siteId, place] as const),
      ),
    );
  }
}

/** Val Village, avec son point. */
export const VAL_VILLAGE_PLACE: TransferSitePlace = {
  siteId: "site_vv",
  address: {
    label: "Val Village",
    ligne1: "1 place du Village",
    ligne2: "",
    codePostal: "73320",
    ville: "Tignes",
    pays: "FR",
  },
  gps: { lat: 45.45, lng: 6.9 },
};
