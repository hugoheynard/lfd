import {
  shelfOrderHoldCutoff,
  UNSETTLED_SHOP_ORDER_TTL_MINUTES,
  unsettledShopOrderCutoff,
} from "../unsettled-shop-order-expiry.js";

const MINUTE = 60_000;
const NOW = new Date(1_000 * MINUTE);

function placedMinutesAgo(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * MINUTE);
}

/** Une commande est expirée si elle a été passée strictement avant la limite. */
function isExpired(placedAt: Date): boolean {
  return placedAt < unsettledShopOrderCutoff(NOW);
}

describe("unsettledShopOrderCutoff — le délai de vie d'une commande boutique non réglée", () => {
  it("vaut trente minutes", () => {
    expect(UNSETTLED_SHOP_ORDER_TTL_MINUTES).toBe(30);
  });

  it("garde une commande passée il y a 29 minutes", () => {
    expect(isExpired(placedMinutesAgo(29))).toBe(false);
  });

  it("garde une commande passée il y a exactement 30 minutes", () => {
    expect(isExpired(placedMinutesAgo(30))).toBe(false);
  });

  it("expire une commande passée il y a 31 minutes", () => {
    expect(isExpired(placedMinutesAgo(31))).toBe(true);
  });
});

/**
 * La tenue du stock suit la durée réglée en admin (5 à 120 minutes) : même
 * borne exclusive que la boutique — passée strictement avant la limite, elle
 * est expirée ; à la minute pile, elle tient encore.
 */
describe("shelfOrderHoldCutoff — la tenue du stock d'une commande sur stock", () => {
  const isHeldOut = (placedAt: Date, holdMinutes: number) =>
    placedAt < shelfOrderHoldCutoff(NOW, holdMinutes);

  it.each([5, 30, 120])(
    "à %i minutes : la veille de la limite tient, la limite tient, la suivante expire",
    (hold) => {
      expect(isHeldOut(placedMinutesAgo(hold - 1), hold)).toBe(false);
      expect(isHeldOut(placedMinutesAgo(hold), hold)).toBe(false);
      expect(isHeldOut(placedMinutesAgo(hold + 1), hold)).toBe(true);
    },
  );

  it("une commande de 31 minutes tient sous un réglage de 120, expire sous un réglage de 5", () => {
    expect(isHeldOut(placedMinutesAgo(31), 120)).toBe(false);
    expect(isHeldOut(placedMinutesAgo(31), 5)).toBe(true);
  });
});
