import type { OrderShortfallMailsCopy } from "../model/order-shortfall-mails.model.js";

/** The "incomplete departure" family, in English. */
export const ORDER_SHORTFALL_MAILS_EN: OrderShortfallMailsCopy = {
  "customer.order-shortfall": {
    kicker: "Incomplete order",
    subject: "Order {ref}: it leaves incomplete",
    title: "Your order leaves incomplete.",
    intro:
      "Hello,\n\nSome items are missing for your order {ref}: it leaves with what we could prepare.",
    departedHeading: "What leaves:",
    missingHeading: "What is missing:",
    line: "– {quantity} × {product}",
    contactSales: "Contact our sales team.",
    closing: "We apologise for the missing items.",
    footer: "Any doubt or mistake? Call the bakery.",
  },
};
