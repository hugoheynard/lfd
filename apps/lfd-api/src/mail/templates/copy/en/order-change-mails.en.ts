import type { OrderChangeMailsCopy } from "../model/order-change-mails.model.js";

/** The "change request" family, in English. */
export const ORDER_CHANGE_MAILS_EN: OrderChangeMailsCopy = {
  "customer.order-revised": {
    subject: "Your order {ref} has been changed",
    kicker: "Order changed",
    title: "Your order has been changed.",
    intro: "Your order {ref} has been changed. Here are its updated details.",
    totalShift: "The total goes from {previous} to {total}.",
    sameTotal: "The total stays at {total}.",
    invoice: "The new total will appear on your invoice.",
    cardCharged: "The difference of {amount} has been paid by card.",
    cardRefunded: "{amount} will be refunded to your card.",
    cta: "View my order",
    footer: "Any doubt or mistake? Call the bakery.",
  },
  "customer.order-change-applied": {
    kicker: "Order changed",
    subject: "Order {ref} changed as you asked",
    title: "Your change is done.",
    intro: "We have changed your order {ref} as you asked.",
    totalLabel: "New total incl. VAT",
    moreToPay: "That is {amount} more than before: the total was {previous}.",
    lessToPay: "That is {amount} less than before: the total was {previous}.",
    sameTotal: "The total is the same as before.",
    where: "The updated order is in your account, under My orders.",
    footer: "Any doubt or mistake? Call the bakery.",
  },
  "customer.order-change-refused": {
    kicker: "Change request",
    subject: "Order {ref}: change not possible",
    title: "We could not change your order.",
    intro: "You asked us to change your order {ref}: it is not possible.",
    reasonLabel: "A word from our team",
    contactSales: "Contact our sales team.",
  },
};
