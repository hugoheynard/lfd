import type { ClientSheet } from "@lfd/contracts";

import { totalRows } from "../../../../orders/domain/services/order-sheet-pdf-totals.js";
import { LINE, sheet } from "../../../../orders/domain/services/__tests__/client-sheet.fixture.js";
import { remainderAdjustmentsOf } from "../remainder-decision-source.js";

/**
 * **Le port du reliquat masqué sur le papier** (décision de Hugo du
 * 2026-10-26, `documentation/commandes/bon-de-livraison.md`).
 *
 * Le BL d'un reste garde dans son modèle un port, une surtaxe et une remise
 * fixe à zéro (`remainderAdjustmentsOf` : ils sont comptés sur le BL-1). Le
 * pavé de totaux du BL imprimé — celui du bon de commande, lu par
 * `renderClientNotePdf` — ne doit pas en faire des lignes « Livraison 0,00 € » :
 * un client lirait qu'on lui offre un port qu'il a payé sur le premier envoi.
 */

const SEALED = { ...LINE, unitPriceTtcCents: 78, lineTotalTtcCents: 12_491 };
const GESTURES = /Livraison|Surtaxe|Remise/u;

/** Les montants d'un reste : ses articles, aucun geste fixe. */
function remainderPaper(variant: ClientSheet["variant"]): ClientSheet {
  const base = sheet();
  return sheet({
    variant,
    lines: [SEALED],
    money: {
      ...base.money,
      vatShares: null,
      discountCents: 0,
      voucherDiscountCents: 0,
      deliveryFeeCents: 0,
      lateFeeCents: 0,
      totalCents: 12_491,
    },
  });
}

describe("le BL d'un reste, sur le papier", () => {
  it("le modèle garde port, surtaxe et remise fixe à zéro", () => {
    const adjustments = remainderAdjustmentsOf({
      discount: { mode: "amount", cents: 500 },
      deliveryFee: { mode: "amount", cents: 1_200 },
      lateFee: null,
      deliveryVatMode: "standard",
    });

    expect(adjustments).toMatchObject({ discount: null, deliveryFee: null, lateFee: null });
  });

  it.each(["pro", "public"] as const)(
    "bon %s : aucune ligne de port, de surtaxe ni de remise à 0 €",
    (variant) => {
      const labels = totalRows(remainderPaper(variant)).map((row) => row.label);

      expect(labels.filter((label) => GESTURES.test(label))).toEqual([]);
    },
  );
});
