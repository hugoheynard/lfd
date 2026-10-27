import {
  KICKER,
  NAMED_TITLE,
  SUBJECT,
  texts,
  variants,
  variantsOf,
  type MailLayouts,
} from "./mail-layout.types.js";

/** Les trois régimes d'une commande, tels que le courriel les distingue. */
const SETTLEMENTS = {
  paid: "Commande payée par carte",
  due: "Commande à régler",
  account: "Commande au compte",
};

/** Le QR de retrait : sa légende et son texte de repli. `qrTitle` n'est rendu nulle part (vu le 2026-10-23). */
const QR = {
  id: "image",
  label: "QR de retrait",
  texts: texts("qrLine", "qrAlt", "qrTitle"),
} as const;

/** L'itinéraire vers le point de retrait (S7) — absent pour une livraison. */
const ITINERARY = { id: "itinerary", texts: texts("itinerary") } as const;

/** Le « Rappel au client » de la Supervision : le même e-mail, renvoyé à qui n'est pas venu. */
const REMINDER = "Rappel au client qui n'est pas venu";
/** Le variant d'un envoi de rang > 1 (plan E7 reliquat, choix 17). */
const REMAINDER = "Le reste de la commande";

/** Les e-mails d'une commande et de son règlement. */
export const ORDER_MAIL_LAYOUTS: Readonly<
  Pick<
    MailLayouts,
    | "customer.order-placed"
    | "customer.order-ready"
    | "customer.delivery-en-route"
    | "customer.order-delayed"
    | "customer.order-placed-with-your-email"
    | "customer.payment-failed"
    | "customer.payment-expired"
    | "customer.order-cancelled"
    | "customer.order-payment-link"
  >
> = {
  "customer.order-placed": {
    subject: SUBJECT,
    header: KICKER,
    sections: [
      { id: "title", texts: variantsOf("title", SETTLEMENTS) },
      { id: "body", texts: texts("intro") },
      {
        id: "summary",
        texts: [
          ...variants({ recapPickup: "En retrait", recapDelivery: "En livraison" }),
          ...texts(
            "recapContent",
            "recapPieces",
            "recapDiscount",
            "recapDiscountBase",
            "recapVoucher",
            "recapVat",
            "recapVatRate",
          ),
          ...variantsOf("totalLabel", SETTLEMENTS),
          ...variants({
            totalPretax: "Commande au compte : le total HT",
            recapTaxLater: "Commande au compte : la TVA plus tard",
            recapTaxLaterValue: "Commande au compte : ce qu'on lit en face",
          }),
        ],
      },
      QR,
      ITINERARY,
      { id: "cta", texts: texts("cta") },
      { id: "secondaryLink", label: "Gérer ou annuler", texts: texts("manageLink") },
      { id: "footer", texts: texts("changeNote", "footer") },
    ],
  },
  "customer.order-ready": {
    subject: [...SUBJECT, ...variants({ subjectReminder: REMINDER, subjectRemainder: REMAINDER })],
    header: [...KICKER, ...variants({ kickerReminder: REMINDER, kickerRemainder: REMAINDER })],
    sections: [
      {
        id: "title",
        texts: variants({
          titlePickup: "Commande en retrait",
          titleDelivery: "Commande livrée",
          titleReminder: REMINDER,
          titleRemainderPickup: `${REMAINDER}, en retrait`,
          titleRemainderDelivery: `${REMAINDER}, livré`,
        }),
      },
      {
        id: "body",
        texts: variants({
          introPickup: "Commande en retrait",
          introDelivery: "Commande livrée",
          introReminder: REMINDER,
          introReminderWithoutSite: `${REMINDER}, sans nom de point`,
          introRemainderPickup: `${REMAINDER}, en retrait`,
          introRemainderDelivery: `${REMAINDER}, livré`,
        }),
      },
      { id: "summary", texts: texts("whereLabel", "contentLabel", "piecesLabel") },
      QR,
      ITINERARY,
      { id: "cta", texts: texts("cta") },
      { id: "footer", texts: texts("footer") },
    ],
  },
  "customer.delivery-en-route": {
    subject: [...SUBJECT, ...variants({ subjectRemainder: REMAINDER })],
    header: KICKER,
    sections: [
      { id: "title", texts: [...texts("title"), ...variants({ titleRemainder: REMAINDER })] },
      { id: "body", texts: [...texts("intro"), ...variants({ introRemainder: REMAINDER })] },
      { id: "summary", texts: texts("referenceLabel", "addressLabel") },
      { id: "cta", texts: texts("cta") },
      { id: "footer", texts: texts("footer") },
    ],
  },
  "customer.order-delayed": {
    subject: SUBJECT,
    header: KICKER,
    sections: [
      { id: "title", texts: texts("title") },
      { id: "body", texts: texts("intro", "apology") },
      { id: "summary", texts: texts("referenceLabel", "whereLabel") },
      { id: "cta", texts: texts("cta") },
      { id: "footer", texts: texts("footer") },
    ],
  },
  "customer.order-placed-with-your-email": {
    subject: SUBJECT,
    header: KICKER,
    sections: [
      { id: "title", texts: NAMED_TITLE },
      { id: "body", texts: texts("intro", "ifItIsYou") },
      { id: "footer", texts: texts("footer") },
    ],
  },
  "customer.payment-failed": {
    subject: SUBJECT,
    header: KICKER,
    sections: [
      { id: "title", texts: texts("title") },
      { id: "body", texts: texts("intro", "consequence") },
      { id: "summary", texts: texts("amountLabel") },
      { id: "cta", texts: texts("cta") },
      { id: "footer", texts: texts("footer") },
    ],
  },
  "customer.payment-expired": {
    subject: SUBJECT,
    header: KICKER,
    sections: [
      { id: "title", texts: texts("title") },
      { id: "body", texts: texts("intro", "consequence") },
      { id: "summary", texts: texts("amountLabel") },
      { id: "footer", texts: texts("footer") },
    ],
  },
  "customer.order-cancelled": {
    subject: SUBJECT,
    header: KICKER,
    sections: [
      { id: "title", texts: texts("title") },
      {
        id: "body",
        texts: variants({
          intro: "Annulée par l'équipe",
          introWithoutDay: "Annulée par l'équipe, sans jour de service",
          introBySelf: "Annulée par le client",
          introBySelfWithoutDay: "Annulée par le client, sans jour de service",
          introByMember: "Annulée par un autre membre de la société",
          introByMemberWithoutDay: "Annulée par un autre membre, sans jour de service",
          introByPrincipal: "Annulée par le compte principal",
          introByPrincipalWithoutDay: "Annulée par le compte principal, sans jour de service",
          nothingBilled: "Commande gratuite",
          nothingCharged: "Carte non débitée",
          nothingInvoiced: "Commande au compte",
          refundToCard: "Payée par carte : remboursement annoncé",
          alreadyRefunded: "Payée par carte : déjà remboursée",
          voucherReturned: "Bon de fidélité rendu",
          voucherMerged: "Bon de fidélité fusionné",
        }),
      },
      { id: "footer", texts: texts("footer") },
    ],
  },
  "customer.order-payment-link": {
    subject: SUBJECT,
    header: KICKER,
    sections: [
      { id: "title", texts: texts("title") },
      { id: "body", texts: texts("intro", "howToPay") },
      { id: "summary", texts: texts("amountLabel") },
      { id: "cta", texts: texts("cta") },
      { id: "footer", texts: texts("footer") },
    ],
  },
};
