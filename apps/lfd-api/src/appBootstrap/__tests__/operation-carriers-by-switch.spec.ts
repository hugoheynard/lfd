import { MediaCarriers } from "../../media/channels/carriers/media-carriers.js";
import { mediaCarriersFor, type MediaCarrierParts } from "../operation-carriers-by-switch.js";

/** Un porteur muet, reconnaissable à son nom. */
class Named extends MediaCarriers {
  constructor(readonly name: string) {
    super();
  }

  usesOf(): Promise<ReadonlyMap<string, number>> {
    return Promise.resolve(new Map());
  }

  carriersOf(): Promise<readonly []> {
    return Promise.resolve([]);
  }

  repoint(): Promise<number> {
    return Promise.resolve(0);
  }
}

const PARTS: MediaCarrierParts = {
  pimCatalogue: new Named("pimCatalogue"),
  pimOperations: new Named("pimOperations"),
  storefront: new Named("storefront"),
  commerceCopies: new Named("commerceCopies"),
  commerceOperations: new Named("commerceOperations"),
};

function names(carriers: readonly MediaCarriers[]): string[] {
  return carriers.map((carrier) => (carrier instanceof Named ? carrier.name : "?"));
}

describe("mediaCarriersFor", () => {
  it("fermé : exactement la liste d'avant, dans le même ordre", () => {
    expect(names(mediaCarriersFor(false, PARTS))).toEqual([
      "pimCatalogue",
      "pimOperations",
      "storefront",
      "commerceCopies",
    ]);
  });

  /** Ouvert, `pim.operation` est une table qu'on ne sert plus, et les copies sont la même table. */
  it("ouvert : ni les opérations du référentiel, ni les copies — les opérations du commerce", () => {
    expect(names(mediaCarriersFor(true, PARTS))).toEqual([
      "pimCatalogue",
      "storefront",
      "commerceOperations",
    ]);
  });
});
