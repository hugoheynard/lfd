import type { DeliveryAddressView } from "../address.js";
import {
  counterCustomerCardSchema,
  counterCustomerViewSchema,
  type CounterDeliveryAddress,
} from "../counter-customer.js";

/** Les deux sources de l'écran de commande doivent se projeter sans traduire. */
const sameShape = (address: DeliveryAddressView): CounterDeliveryAddress => address;

describe("counterCustomerCardSchema", () => {
  it("ne laisse passer ni propriétaire ni conditions — une carte de recherche", () => {
    const parsed = counterCustomerCardSchema.parse({
      id: "c1",
      name: "Boulangerie du Col",
      tradeName: "",
      reference: "CLI-0001",
      siret: "12345678901234",
      owner: { email: "patron@col.fr" },
      grantedTerms: ["monthly"],
    });

    expect(Object.keys(parsed).sort()).toEqual(["id", "name", "reference", "siret", "tradeName"]);
  });
});

describe("counterCustomerViewSchema", () => {
  it("refuse un détail sans `settlesOnAccount` : c'est le serveur qui le calcule", () => {
    const result = counterCustomerViewSchema.safeParse({
      id: "c1",
      name: "Boulangerie du Col",
      tradeName: "",
      reference: "CLI-0001",
      status: "active",
      deliveryAddresses: [],
      buyers: [],
    });

    expect(result.success).toBe(false);
  });

  it("porte une adresse du carnet sous la même forme que `DeliveryAddressView`", () => {
    expect(typeof sameShape).toBe("function");
  });
});
