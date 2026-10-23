import type { OrderChangeMailsCopy } from "../model/order-change-mails.model.js";

/** The "change request" family, in English. */
export const ORDER_CHANGE_MAILS_EN: OrderChangeMailsCopy = {
  "customer.order-change-applied": {
    kicker: "Order changed",
    subject: "Order {ref} changed as you asked",
    title: "Your change is done.",
    intro: "We have changed your order {ref} as you asked.",
    where: "The updated order is in your account, under My orders.",
    footer: "Any doubt or mistake? Call the bakery — Le Labo · route de la Balme, Val d'Isère.",
  },
  "customer.order-change-refused": {
    kicker: "Change request",
    subject: "Order {ref}: change not possible",
    title: "We could not change your order.",
    intro: "You asked us to change your order {ref}: it is not possible.",
    reasonLabel: "A word from our team",
    unchanged: "Your order stays as you placed it.",
    footer: "Any doubt or mistake? Call the bakery — Le Labo · route de la Balme, Val d'Isère.",
  },
};
