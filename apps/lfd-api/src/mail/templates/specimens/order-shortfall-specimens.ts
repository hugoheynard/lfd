import { draftOrderShortfallMessage } from "../order-shortfall-mail.js";
import { SPECIMEN_MARK, type MailSpecimens } from "./mail-specimen.types.js";

const REFERENCE = `${SPECIMEN_MARK}-0001`;

/** Le reste rendu de l'exemple : deux croissants et six pains au chocolat. */
const SHORTFALL_REFUNDED_CENTS = 1_140;

/**
 * L'exemple de « Écrire au client » (plan E6d) : le corps est la PROPOSITION
 * elle-même, rédigée dans le périmètre de l'aperçu — un texte réécrit à
 * l'écran des textes s'y voit, comme il se verra au geste. La commande de
 * l'exemple est payée par carte : la proposition dit que le reste sera rendu.
 */
export const ORDER_SHORTFALL_SPECIMENS: Readonly<
  Pick<MailSpecimens, "customer.order-shortfall" | "customer.order-shortfall-refunded">
> = {
  "customer.order-shortfall": {
    family: "order",
    data: (locale) => ({
      reference: REFERENCE,
      message: draftOrderShortfallMessage({
        reference: REFERENCE,
        departed: [{ product: "Croissant au beurre", quantity: 4 }],
        missing: [
          { product: "Croissant au beurre", quantity: 2 },
          { product: "Pain au chocolat", quantity: 6 },
        ],
        cardWillBeRefunded: true,
        locale,
      }),
      locale,
    }),
  },
  "customer.order-shortfall-refunded": {
    family: "order",
    data: (locale) => ({ reference: REFERENCE, amountCents: SHORTFALL_REFUNDED_CENTS, locale }),
  },
};
