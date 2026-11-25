import type { DeliveryAddressBookRow } from "@lfd/contracts";

import { DeliveryAddressBookReader } from "../../../channels/commerce/index.js";
import { GetDeliveryAddressBookHandler } from "../get-delivery-address-book.handler.js";

class FixedAddressBook extends DeliveryAddressBookReader {
  calls = 0;
  constructor(private readonly rows: readonly DeliveryAddressBookRow[]) {
    super();
  }
  deliveryAddresses(): Promise<readonly DeliveryAddressBookRow[]> {
    this.calls += 1;
    return Promise.resolve(this.rows);
  }
}

function row(addressId: string, legalName: string): DeliveryAddressBookRow {
  return {
    addressId,
    companyId: `c-${addressId}`,
    tradeName: "",
    legalName,
    addressLabel: "Boutique",
    ligne1: "1 rue de la Paix",
    ligne2: "",
    codePostal: "75002",
    ville: "Paris",
    pays: "FR",
    isDefault: true,
    door: { lat: 48.86, lng: 2.33 },
    parking: null,
    note: "",
    deliveryContact: null,
    depositAllowed: false,
    doorstepRule: null,
    stopMinutes: null,
    signatureRequired: false,
    signatureSource: "company",
    hasProcedure: false,
    windowMode: null,
    slots: { mode: "everyday", slots: [] },
    deadlines: null,
  };
}

describe("GetDeliveryAddressBookHandler", () => {
  it("rend le carnet tel que le commerce le répond, dans son ordre", async () => {
    const rows = [row("a2", "Alpha"), row("a1", "Bêta")];
    const reader = new FixedAddressBook(rows);
    const view = await new GetDeliveryAddressBookHandler(reader).execute();
    expect(view.addresses.map((r) => r.addressId)).toEqual(["a2", "a1"]);
    expect(reader.calls).toBe(1);
  });

  it("rend la signature effective et son origine telles que le commerce les sert", async () => {
    const own = {
      ...row("a1", "Alpha"),
      signatureRequired: true,
      signatureSource: "address" as const,
    };
    const view = await new GetDeliveryAddressBookHandler(new FixedAddressBook([own])).execute();
    expect(view.addresses[0]).toMatchObject({
      signatureRequired: true,
      signatureSource: "address",
    });
  });

  it("un carnet vide rend une liste vide", async () => {
    const view = await new GetDeliveryAddressBookHandler(new FixedAddressBook([])).execute();
    expect(view).toEqual({ addresses: [] });
  });
});
