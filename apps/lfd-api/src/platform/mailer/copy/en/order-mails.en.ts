import type { OrderMailsCopy } from "../model/order-mails.model.js";

/** La famille « commande », en anglais. Traduction du français, pas une variante. */
export const ORDER_MAILS_EN: OrderMailsCopy = {
  "customer.order-placed": {
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
    recapVoucher: "Loyalty voucher",
    recapVat: "incl. VAT",
    totalPretax: "Charged to your account, excl. VAT",
    recapTaxLater: "VAT and total incl. VAT",
    recapTaxLaterValue: "on the monthly invoice",
    qrTitle: "Your pickup code",
    qrLine: "Show this code at the counter. The team's scan is what records the handover.",
    cta: "View my order",
    changeNote: "Need a change? Call the bakehouse — a placed order goes straight into production.",
    manageLink: "Manage or cancel my order",
    footer: "Le Labo · route de la Balme, Val d'Isère — 7 am – 7 pm",
    qrAlt: "Your pickup code — {ref}",
  },
  "customer.order-ready": {
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
    qrAlt: "Your pickup code — {ref}",
  },
  "customer.delivery-en-route": {
    subject: "Your delivery is on its way",
    title: "Your delivery is on its way.",
    intro: "Your driver has left and will arrive during the day.",
    referenceLabel: "Order",
    addressLabel: "Delivered to",
    cta: "View my order",
    footer: "Le Labo · route de la Balme, Val d'Isère — 7 am – 7 pm",
  },
  "customer.order-placed-with-your-email": {
    subject: "An order has just been placed with your address",
    title: "Hello, {firstName}",
    titleWithoutName: "Hello",
    intro:
      "An order has just been placed on our shop using your email address, " +
      "without going through your account.",
    ifItIsYou:
      "If it was you, there is nothing to do: the confirmation and the pickup code " +
      "were sent to this same address.",
    footer:
      "If it was not you, someone probably typed your address by mistake. " +
      "No access to your account has been opened, and nothing has been changed. " +
      "Reply to this email if you would like us to look into it.",
  },
};
