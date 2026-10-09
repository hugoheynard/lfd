import {
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
