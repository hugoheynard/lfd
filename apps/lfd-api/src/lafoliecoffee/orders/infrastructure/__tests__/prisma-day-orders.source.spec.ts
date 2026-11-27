import { sourcedDayOrderOf, type DayOrderRow } from "../prisma-day-orders.source.js";

/** Une commande de retrait, sans société, sans adresse ni consigne. */
const ROW: DayOrderRow = {
  id: "ord_1",
  orderNumber: "LFD-0001",
  fulfillmentMethod: "pickup",
  fulfillment: null,
  pickupAddress: null,
  deliveryAddressSnapshot: null,
  note: "",
  fromSubscriptionId: null,
  placedByStaffId: null,
  clientele: "public",
  placedOffPlan: false,
  company: null,
  placedBy: { firstName: "Jeanne", lastName: "Roux", email: "jeanne@exemple.fr" },
  lines: [
    {
      sku: "VIE-001",
      productNameSnapshot: "Croissant",
      quantity: 4,
      saleUnit: "piece",
      madeToOrder: null,
      options: [],
    },
  ],
};

describe("sourcedDayOrderOf — « hors plan » servi au fournil", () => {
  it("une commande reçue hors plan par l'équipe se sert `offPlan: true`", () => {
    expect(sourcedDayOrderOf({ ...ROW, placedOffPlan: true }).order.offPlan).toBe(true);
  });

  it("une commande reçue dans le plan se sert `offPlan: false` — le commerce le sait toujours", () => {
    expect(sourcedDayOrderOf(ROW).order.offPlan).toBe(false);
  });
});
