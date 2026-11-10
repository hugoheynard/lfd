import {
  CardOrderNotRevisableError,
  FrozenLinePriceChangedError,
  RevisionBelowVoucherError,
  RevisionFreesAccountOrderError,
  RevisionRequiresPaymentError,
  ShortfallDecidedRevisionError,
  UnchangedOrderRevisionError,
} from "../../errors/order-revision-errors.js";
import { Order } from "../order.js";
import type { RevisableOrder } from "../order-revision.js";
import type { DraftSpec } from "./priced-input.fixture.js";
import { DAY, LABO, input, line, placed, revised } from "./revisable-order.fixture.js";

/**
 * **La révision d'une commande, jugée par l'agrégat** (voir
 * `documentation/commandes/modification/modifier-une-commande.md`, § 2.2 « Le chemin d'une modification ») : M1 ne sert
 * que le compte et le total nul, les prix déjà présents tiennent, le bon
 * imputé reste couvert, et une révision change quelque chose.
 *
 * Les jours de service sont des dates absolues comparées entre elles
 * seulement : aucune horloge ici (exception étroite du CLAUDE.md §5).
 */

describe("Order.revise — ce que M1 sert", () => {
  it("révise une commande au compte : nouvelle révision, nouveau total, lignes changées", () => {
    const revision = Order.revise(placed(), revised(placed(), { lines: [line("VIE-001", 20)] }));

    expect(revision).toMatchObject({
      fromRevision: 0,
      toRevision: 1,
      changes: ["lines"],
      routeChanged: false,
      onAccount: true,
    });
    // 20 × 2,00 € = 40,00 € HT ; TVA 5,5 % = 2,20 € ; total = 42,20 €.
    expect(revision.totalAfterCents).toBe(4_220);
    expect(revision.totalBeforeCents).toBe(2_110);
    expect(revision.state.paymentStatus).toBe("not_required");
  });

  it("refuse une commande dont la carte est attendue, avec la phrase de sortie", () => {
    const due = placed({ paymentStatus: "pending", stripePaymentIntentId: "pi_1" });

    expect(() => Order.revise(due, revised(due, { lines: [line("VIE-001", 20)] }))).toThrow(
      CardOrderNotRevisableError,
    );
    expect(() => Order.revise(due, revised(due, { lines: [line("VIE-001", 20)] }))).toThrow(
      "Commande réglée par carte : annulez-la et recommandez, ou demandez au commerce.",
    );
  });

  it("refuse une commande dont le départ incomplet est décidé (E6b)", () => {
    const decided = placed({ shortfallDecided: true });

    expect(() => Order.revise(decided, revised(decided, { lines: [line("VIE-001", 20)] }))).toThrow(
      ShortfallDecidedRevisionError,
    );
  });

  it("refuse une commande déjà payée par carte", () => {
    const paid = placed({ paymentStatus: "paid", stripePaymentIntentId: "pi_1" });

    expect(() => Order.revise(paid, revised(paid, { lines: [line("VIE-001", 20)] }))).toThrow(
      CardOrderNotRevisableError,
    );
  });

  it("refuse qu'une commande gratuite devienne payante : c'est une carte, donc M2", () => {
    const free = placed({}, input({ lines: [line("VIE-001", 10, 0)] }));

    expect(() =>
      Order.revise(free, revised(free, { lines: [line("VIE-001", 10, 0), line("PAI-001", 1)] })),
    ).toThrow(RevisionRequiresPaymentError);
  });

  it("refuse qu'une commande au compte tombe à zéro", () => {
    expect(() =>
      Order.revise(placed(), revised(placed(), { lines: [line("PAI-001", 1, 0)] })),
    ).toThrow(RevisionFreesAccountOrderError);
  });
});

describe("Order.revise — R3, les prix figés", () => {
  it("refuse une ligne déjà présente qui n'a pas gardé son prix d'origine", () => {
    expect(() =>
      Order.revise(placed(), revised(placed(), { lines: [line("VIE-001", 12, 250)] })),
    ).toThrow(FrozenLinePriceChangedError);
  });

  it("laisse une ligne NOUVELLE à son prix du jour", () => {
    const revision = Order.revise(
      placed(),
      revised(placed(), { lines: [line("VIE-001", 10), line("PAI-001", 1, 350)] }),
    );

    expect(revision.state.lines.map((entry) => entry.sku)).toEqual(["VIE-001", "PAI-001"]);
  });
});

describe("Order.revise — R6, une révision change quelque chose", () => {
  it("refuse une révision qui ne change rien", () => {
    expect(() => Order.revise(placed(), revised(placed()))).toThrow(UnchangedOrderRevisionError);
  });

  it("le devis, lui, recompose un panier intact sans refuser", () => {
    expect(Order.recompose(placed(), revised(placed())).revision.changes).toEqual([]);
  });

  it("nomme ce qui a changé, et dit quand l'acheminement a bougé", () => {
    const revision = Order.revise(
      placed(),
      revised(placed(), {
        requestedDeliveryDate: new Date("2026-11-11T00:00:00.000Z"),
        note: "Sonner deux fois",
      }),
    );

    expect(revision.changes).toEqual(["date", "note"]);
    expect(revision.routeChanged).toBe(true);
    expect(revision.previousServiceDay).toBe(DAY);
    expect(revision.serviceDay).toBe("2026-11-11");
  });

  it("ne voit pas de changement dans un point relu dans un autre ordre de clés", () => {
    const reordered = placed({
      fulfillment: {
        ...placed().fulfillment,
        pickupAddress: {
          siteId: "site_1",
          pays: LABO.pays,
          ville: LABO.ville,
          codePostal: LABO.codePostal,
          ligne2: LABO.ligne2,
          ligne1: LABO.ligne1,
          label: LABO.label,
        },
      },
    });

    expect(() => Order.revise(reordered, revised(reordered))).toThrow(UnchangedOrderRevisionError);
  });
});

describe("Order.revise — §9, le bon de fidélité imputé", () => {
  /** Une commande personnelle, dont un bon de 15 € HT a couvert une part. */
  function personal(): { readonly order: RevisableOrder; readonly base: Partial<DraftSpec> } {
    const base: Partial<DraftSpec> = {
      companyId: null,
      billedCompanyId: null,
      salesTerms: { document: "salesTerms", revision: null, fileId: null },
      voucher: { id: "vch_1", valueCents: 1_500 },
    };
    const order = placed({ voucher: { id: "vch_1", appliedCents: 1_500 } }, input(base));
    return { order, base };
  }

  it("refuse une révision qui ferait passer le total sous le bon déjà déduit", () => {
    const { order, base } = personal();

    expect(() =>
      Order.revise(
        order,
        revised(order, {
          ...base,
          lines: [line("VIE-001", 5)],
          voucher: { id: "vch_1", valueCents: order.voucher?.appliedCents ?? 0 },
        }),
      ),
    ).toThrow(RevisionBelowVoucherError);
  });

  it("garde le bon entier quand la commande grossit", () => {
    const { order, base } = personal();

    const revision = Order.revise(
      order,
      revised(order, {
        ...base,
        lines: [line("VIE-001", 20)],
        voucher: { id: "vch_1", valueCents: order.voucher?.appliedCents ?? 0 },
      }),
    );

    // Composée en TTC (`exact_ht`) : le bon y vaut sa valeur faciale TTC, et
    // sa part HT est ce que la composition lui laisse (plan du centime, § 10 Q2).
    expect(revision.state.vatMethod).toBe("exact_ht");
    expect(revision.state.voucherTtcCents).toBe(1_500);
    expect(revision.state.voucherDiscountCents).toBeLessThan(1_500);
  });

  /**
   * Plan du centime, § 5 : la méthode se lit sur la commande, jamais sur sa
   * clientèle — un particulier passé avant la voie B (`line_ht`), révisé
   * après, reste composé HT, bon compris.
   */
  it("une commande line_ht d'un particulier, révisée, reste line_ht", () => {
    const { order, base } = personal();
    const before = { ...order, vatMethod: "line_ht" as const };

    const revision = Order.revise(
      before,
      revised(before, {
        ...base,
        lines: [line("VIE-001", 20)],
        voucher: { id: "vch_1", valueCents: 1_500 },
      }),
    );

    expect(revision.state.vatMethod).toBe("line_ht");
    expect(revision.state.voucherDiscountCents).toBe(1_500);
    expect(revision.state.voucherTtcCents).toBeNull();
    expect(revision.state.discountTtcCents).toBeNull();
    expect(revision.state.deliveryFeeTtcCents).toBeNull();
  });
});
