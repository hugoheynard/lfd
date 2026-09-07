import type { MailCopy } from "./mail-copy.model.js";

/**
 * L'anglais. Traduction de {@link MAIL_FR}, pas une variante : si une phrase
 * française change de sens, celle-ci doit changer avec elle.
 */
export const MAIL_EN: MailCopy = {
  orderPlaced: {
    subject: "Your order {ref} — La Folie Coffee",
    kicker: "Confirmed",
    title: {
      paid: "All settled.",
      due: "Order recorded.",
      account: "Order recorded.",
    },
    intro: "Your order joins tomorrow morning's bake.",
    totalLabel: {
      paid: "Paid online",
      due: "Left to pay",
      account: "Charged to your account",
    },
    recapPickup: "Pickup",
    recapDelivery: "Delivery",
    recapContent: "Contents",
    recapPieces: "{count} items",
    recapDiscount: "Discount",
    recapVat: "incl. VAT",
    qrTitle: "Your pickup code",
    qrLine: "Show this code at the counter. The team's scan is what records the handover.",
    cta: "View my order",
    changeNote: "Need a change? Call the bakehouse — a placed order goes straight into production.",
    footer: "Le Labo · route de la Balme, Val d'Isère — 7 am – 7 pm",
  },
  orderReady: {
    subject: "Your order {ref} is ready",
    kicker: "Ready",
    titlePickup: "It's ready.",
    titleDelivery: "Ready to go.",
    introPickup: "Your order is waiting at the counter.",
    introDelivery: "Your order is on its way to you.",
    whereLabel: "Pick up at",
    contentLabel: "Contents",
    piecesLabel: "{count} items",
    qrTitle: "Your pickup code",
    qrLine: "Show this code at the counter. The team's scan is what records the handover.",
    cta: "View my order",
    footer: "Le Labo · route de la Balme, Val d'Isère — 7 am – 7 pm",
  },
};
