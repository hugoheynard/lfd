import type { PaymentMailsCopy } from "../model/payment-mails.model.js";

/** La famille « paiement et annulation », en anglais. Traduction du français, pas une variante. */
export const PAYMENT_MAILS_EN: PaymentMailsCopy = {
  "customer.payment-failed": {
    subject: "Payment declined — your order {ref}",
    kicker: "Payment declined",
    title: "Your payment did not go through.",
    intro: "Your bank declined the payment for this order.",
    consequence:
      "Your order will not go into production, and nothing is waiting for you at the counter. " +
      "Resume the payment below to bring it back.",
    amountLabel: "Amount due",
    cta: "Resume payment",
    footer:
      "Unsure, or think this is a mistake? Call us — Le Labo · route de la Balme, Val d'Isère.",
  },
  "customer.payment-expired": {
    subject: "Order {ref} cancelled — payment not completed",
    kicker: "Order cancelled",
    title: "Your payment did not go through in time.",
    intro: "The payment for this order was not completed before the batch was prepared.",
    consequence:
      "Your order has therefore been cancelled, and nothing has been charged. " +
      "If you still need it, please place a new order.",
    amountLabel: "Amount not charged",
    footer:
      "Unsure, or think this is a mistake? Call us — Le Labo · route de la Balme, Val d'Isère.",
  },
  "customer.order-payment-link": {
    kicker: "Payment due",
    subject: "Your order {ref} is still to be paid",
    title: "Your order is awaiting payment",
    intro: "We have not yet received the payment for your order {ref}.",
    howToPay: "You can pay for it by card from your account, by following the link below.",
    amountLabel: "Amount due",
    cta: "Pay for my order",
    footer:
      "Already paid? Our messages crossed: please ignore this one. " +
      "Any doubt? Reply to this email.",
  },
  "customer.order-cancelled": {
    kicker: "Order cancelled",
    subject: "Order {ref} cancelled",
    title: "Your order has been cancelled.",
    intro: "Your order {ref} for {day} has been cancelled by our team.",
    introWithoutDay: "Your order {ref} has been cancelled by our team.",
    introBySelf: "You cancelled your order {ref} for {day}.",
    introBySelfWithoutDay: "You cancelled your order {ref}.",
    introByMember: "{name} cancelled order {ref} for {company}, due {day}.",
    introByMemberWithoutDay: "{name} cancelled order {ref} for {company}.",
    introByPrincipal:
      "Order {ref}, due {day}, was cancelled by {name}, from the main account {principal}.",
    introByPrincipalWithoutDay:
      "Order {ref} was cancelled by {name}, from the main account {principal}.",
    nothingBilled: "You will not be charged anything for this order.",
    nothingCharged: "No payment has been taken.",
    nothingInvoiced: "Nothing will be invoiced or debited for this order.",
    refundToCard:
      "The amount of {amount} paid by card and not already refunded to you will be refunded to the same card. Depending on your bank, it appears within 5 to 10 business days.",
    alreadyRefunded: "The payment for this order has already been refunded to you.",
    voucherReturned:
      "Your loyalty voucher of {value} has been returned to you: you can use it on a future order until {day}.",
    voucherMerged:
      "Your loyalty voucher is back to its value of {value}, valid until {day}. The {remainder} voucher you were given as the remainder is replaced by this one.",
    footer:
      "Unsure, or think this is a mistake? Call us — Le Labo · route de la Balme, Val d'Isère.",
  },
};
