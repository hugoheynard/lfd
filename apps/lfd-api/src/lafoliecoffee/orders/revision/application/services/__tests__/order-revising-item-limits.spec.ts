import { orderPretaxCents } from "@lfd/money";

import { FixedClock } from "../../../../../../platform/time/fixed-clock.js";
import { ItemLimitPassedOnRevisionError } from "../../../../domain/errors/item-limit-override-errors.js";
import { PastOrderCutoffError } from "../../../../domain/errors/order-errors.js";
import type { ItemLimitOverride } from "../../../../domain/services/item-limit-overrides.js";
import type { RevisableOrder } from "../../../domain/entities/order-revision.js";
import {
  AFTER_CUTOFF,
  CATALOG,
  content,
  DAY,
  NEXT_DAY,
  NOW,
  placedOrder,
  revisingAt,
} from "../../commands/__tests__/revision-scene.js";

/**
 * **La limite d'un produit dans une modification** (plan
 * `documentation/limites-de-commande/passer-outre-la-limite-d-un-produit.md`,
 * § 3.6, lot O5).
 *
 * La scène : la règle générale ferme la veille à 18 h (ouverte à `NOW`,
 * fermée à `AFTER_CUTOFF`) ; le pain se commande trois jours avant, midi —
 * passé à `NOW` ; le croissant n'a pas de limite propre. Instants de la scène,
 * horloge FIXE (exception étroite du CLAUDE.md § 5).
 */
const STAFF = { kind: "staff", staffId: "stf_1" } as const;
const CUSTOMER = { kind: "customer", userId: "usr_1" } as const;

const GENERAL_RULE = {
  list: () =>
    Promise.resolve([
      {
        id: "general",
        pickupAddressId: null,
        pickupLabel: null,
        weekday: null,
        daysBefore: 1,
        time: "18:00",
        graceMinutes: 0,
      },
    ]),
};

function catalogWhereBread(staffMayExceed: boolean): typeof CATALOG {
  return CATALOG.map((item) =>
    item.sku === "PAI-001"
      ? {
          ...item,
          orderTimeLimit: { daysBefore: 3, time: "12:00", graceMinutes: 0, staffMayExceed },
        }
      : { ...item, orderTimeLimit: null },
  );
}

function revising(
  options: {
    readonly staffMayExceed?: boolean;
    readonly consigned?: readonly ItemLimitOverride[];
    readonly at?: Date;
  } = {},
) {
  return revisingAt(new FixedClock(options.at ?? NOW), {
    cutoffs: GENERAL_RULE,
    catalogItems: catalogWhereBread(options.staffMayExceed ?? true),
    consigned: options.consigned ?? [],
  });
}

const CROISSANTS = { sku: "VIE-001", quantity: 10 } as const;
const ONE_BREAD = { sku: "PAI-001", quantity: 1 } as const;

/** La commande de la scène, plus un pain — passée quand sa limite était ouverte. */
async function withBread(): Promise<RevisableOrder> {
  const base = await placedOrder();
  const { revision } = await revisingAt(new FixedClock(NOW)).compose(
    base,
    content({ lines: [CROISSANTS, ONE_BREAD] }),
    STAFF,
    { requireChange: false, decidedAt: NOW },
  );
  const { state } = revision;
  return {
    ...base,
    lines: state.lines,
    totalCents: state.totalCents,
    pretaxCents: orderPretaxCents(state),
  };
}

/** Le pain de `withBread`, passé outre à la saisie pour `DAY`. */
const BREAD_OVERRIDE: ItemLimitOverride = {
  id: "ovr_1",
  orderId: "ord_1",
  sku: "PAI-001",
  staffUserId: "stf_1",
  reason: "Salon",
  serviceDay: DAY,
  daysBefore: 3,
  time: "12:00",
  limitAt: NOW,
  origin: "placement",
  createdAt: NOW,
};

describe("OrderRevising — l'équipe et la limite d'un produit ajouté", () => {
  const ADD_BREAD = content({ lines: [CROISSANTS, ONE_BREAD] });

  it("refuse sans le droit, en nommant le produit", async () => {
    const order = await placedOrder();

    await expect(
      revising().compose(order, ADD_BREAD, STAFF, { requireChange: true, decidedAt: NOW }),
    ).rejects.toThrow(ItemLimitPassedOnRevisionError);
  });

  it("avec le droit et la case du produit : rend le dépassement, sans refuser", async () => {
    const order = await placedOrder();

    const composed = await revising().compose(order, ADD_BREAD, STAFF, {
      requireChange: true,
      decidedAt: NOW,
      exceedItemLimits: true,
    });

    expect(composed.exceeded.map((passed) => [passed.sku, passed.rule.daysBefore])).toEqual([
      ["PAI-001", 3],
    ]);
  });

  it("refuse un produit dont la case n'est pas cochée, même avec le droit", async () => {
    const order = await placedOrder();

    await expect(
      revising({ staffMayExceed: false }).compose(order, ADD_BREAD, STAFF, {
        requireChange: true,
        decidedAt: NOW,
        exceedItemLimits: true,
      }),
    ).rejects.toThrow(ItemLimitPassedOnRevisionError);
  });

  it("refuse une ligne AUGMENTÉE comme une ligne ajoutée", async () => {
    const order = await withBread();

    await expect(
      revising().compose(
        order,
        content({ lines: [CROISSANTS, { sku: "PAI-001", quantity: 2 }] }),
        STAFF,
        {
          requireChange: true,
          decidedAt: NOW,
        },
      ),
    ).rejects.toThrow(ItemLimitPassedOnRevisionError);
  });

  it("laisse passer une ligne gardée ou réduite, la règle générale passée comprise (comme avant)", async () => {
    const order = await withBread();

    const composed = await revising({ at: AFTER_CUTOFF }).compose(
      order,
      content({ lines: [{ sku: "VIE-001", quantity: 4 }, ONE_BREAD] }),
      STAFF,
      { requireChange: true, decidedAt: AFTER_CUTOFF },
    );

    expect(composed.exceeded).toEqual([]);
  });

  it("n'oppose pas la règle générale à l'ajout d'un produit sans limite propre", async () => {
    const order = await placedOrder();

    const composed = await revising({ at: AFTER_CUTOFF }).compose(
      order,
      content({ lines: [{ sku: "VIE-001", quantity: 12 }] }),
      STAFF,
      { requireChange: true, decidedAt: AFTER_CUTOFF },
    );

    expect(composed.exceeded).toEqual([]);
  });

  it("le devis de l'équipe annonce le dépassement sans exiger de motif", async () => {
    const order = await placedOrder();

    const quoted = await revising().quote(order, ADD_BREAD, STAFF, {
      requireChange: false,
      decidedAt: NOW,
      exceedItemLimits: true,
    });

    expect(quoted.exceeded.map((passed) => passed.sku)).toEqual(["PAI-001"]);
  });
});

describe("OrderRevising — le client et une limite passée outre par l'équipe", () => {
  it("modifie une autre ligne d'une commande dont le pain a été passé outre", async () => {
    const order = await withBread();

    const composed = await revising({ consigned: [BREAD_OVERRIDE] }).compose(
      order,
      content({ lines: [{ sku: "VIE-001", quantity: 12 }, ONE_BREAD] }),
      CUSTOMER,
      { requireChange: true, decidedAt: NOW },
    );

    expect(composed.revision.changes).toEqual(["lines"]);
  });

  it("sans trace consignée, la même modification est refusée : c'est la trace qui écarte la limite", async () => {
    const order = await withBread();

    await expect(
      revising().compose(
        order,
        content({ lines: [{ sku: "VIE-001", quantity: 12 }, ONE_BREAD] }),
        CUSTOMER,
        { requireChange: true, decidedAt: NOW },
      ),
    ).rejects.toBeInstanceOf(PastOrderCutoffError);
  });

  it("refuse au client d'augmenter la ligne passée outre", async () => {
    const order = await withBread();

    await expect(
      revising({ consigned: [BREAD_OVERRIDE] }).compose(
        order,
        content({ lines: [CROISSANTS, { sku: "PAI-001", quantity: 2 }] }),
        CUSTOMER,
        { requireChange: true, decidedAt: NOW },
      ),
    ).rejects.toBeInstanceOf(PastOrderCutoffError);
  });

  it("rejuge la ligne passée outre quand le client la déplace à une autre journée", async () => {
    const order = await withBread();

    await expect(
      revising({ consigned: [BREAD_OVERRIDE] }).compose(
        order,
        content({ requestedDeliveryDate: NEXT_DAY, lines: [CROISSANTS, ONE_BREAD] }),
        CUSTOMER,
        { requireChange: true, decidedAt: NOW },
      ),
    ).rejects.toBeInstanceOf(PastOrderCutoffError);
  });

  it("dit la commande encore modifiable au client, la limite consignée écartée", async () => {
    const order = await withBread();

    const consigned = await revising({ consigned: [BREAD_OVERRIDE] }).revisabilityOf(
      order,
      "customer",
      null,
      "revise",
    );
    const bare = await revising().revisabilityOf(order, "customer", null, "revise");

    expect(consigned.revisable).toBe(true);
    expect(bare.revisable).toBe(false);
  });

  it("laisse la règle générale fermer la commande, même consignée", async () => {
    const order = await withBread();

    const verdict = await revising({
      consigned: [BREAD_OVERRIDE],
      at: AFTER_CUTOFF,
    }).revisabilityOf(order, "customer", null, "revise");

    expect(verdict.revisable).toBe(false);
  });
});
