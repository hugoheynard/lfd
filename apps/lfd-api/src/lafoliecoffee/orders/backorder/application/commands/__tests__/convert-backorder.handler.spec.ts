import { OrderTotalChangedError } from "../../../../domain/errors/order-total-changed.error.js";
import { OfferNotPermittedError } from "../../../../domain/errors/order-offer-errors.js";
import { IntentKeyReusedError } from "../../../../../../platform/intent/intent-errors.js";
import { Backorder } from "../../../domain/entities/backorder.js";
import {
  BackorderClosedError,
  BackorderNotFoundError,
  ParticularBackorderNotConvertibleError,
} from "../../../domain/errors/backorder-errors.js";
import type { AdminBackorderConvertPayload, AdminBackorderQuotePayload } from "@lfd/contracts";
import {
  activeDiscount,
  BACKORDER,
  FixedBackorderReplays,
  InMemoryBackorders,
  openBackorder,
  ORIGIN_NUMBER,
  ORIGIN_ORDER,
  originReplay,
} from "../../__tests__/backorder-conversion-doubles.js";
import {
  BUYER,
  conversionScene,
  convertPayload,
  quotePayload,
  STAFF,
} from "../../__tests__/backorder-conversion-scene.js";
import { ConvertBackorderCommand } from "../convert-backorder.command.js";

/**
 * **Transformer un reliquat** (`documentation/commandes/reliquat/reliquat.md`, § 6.3) sur
 * la vraie composition : le prix d'origine, le port offert, aucune surtaxe,
 * la dérogation dépensée, le reliquat fermé sur la commande dans la même
 * transaction — et rien d'écrit quand il ne peut pas l'être.
 */

function command(
  over: Partial<AdminBackorderConvertPayload> = {},
  intentKey = "key_1",
  mayOffer = false,
): ConvertBackorderCommand {
  return new ConvertBackorderCommand(
    STAFF,
    BACKORDER,
    convertPayload(over),
    intentKey,
    false,
    mayOffer,
  );
}

/** La transformation, avec le total que l'estimation du même reliquat a montré. */
async function seenTotalOf(
  scene: ReturnType<typeof conversionScene>,
  over: Partial<AdminBackorderQuotePayload> = {},
): Promise<number> {
  const quoted = await scene.quote.execute({
    staffUserId: STAFF,
    backorderId: BACKORDER,
    payload: quotePayload(over),
    exceedItemLimits: false,
  });
  if (quoted.amounts === null) {
    throw new RangeError(`estimation refusée : ${quoted.refusal?.message ?? "?"}`);
  }
  return quoted.amounts.totalCents;
}

function scene(
  backorder: Backorder = openBackorder(),
  origin = originReplay(),
  options: { readonly late?: boolean; readonly waiver?: boolean; readonly lateFee?: boolean } = {},
) {
  const backorders = new InMemoryBackorders([backorder]);
  return {
    backorders,
    ...conversionScene({ ...options, backorders, replays: new FixedBackorderReplays(origin) }),
  };
}

describe("ConvertBackorderHandler — le prix de l'origine", () => {
  it("compose la commande au prix unitaire d'ORIGINE, pas au prix du catalogue d'aujourd'hui", async () => {
    const s = scene();
    const total = await seenTotalOf(s);

    await s.convert.execute(command({ expectedTotalCents: total }));

    const [placed] = s.placed;
    expect(placed?.lines).toEqual([
      expect.objectContaining({ sku: "PAI-001", quantity: 4, unitPriceMillicents: 300_000 }),
    ]);
    expect(placed?.subtotalCents).toBe(1_200);
    expect(placed?.totalCents).toBe(total);
  });

  it("rejoue la remise en pourcentage de l'origine et sort celle en montant fixe", async () => {
    const s = scene(
      openBackorder(),
      originReplay({
        discounts: [
          activeDiscount({ mode: "percent", bp: 1_000 }),
          activeDiscount({ mode: "amount", cents: 500 }),
          activeDiscount(null, { amountCents: 200 }),
        ],
      }),
    );
    const total = await seenTotalOf(s);

    await s.convert.execute(command({ expectedTotalCents: total }));

    // 10 % de 12,00 € : le montant fixe et la remise figée sans ajustement ont servi sur l'origine.
    expect(s.placed[0]?.discountCents).toBe(120);
  });
});

describe("ConvertBackorderHandler — port offert et aucune surtaxe", () => {
  it("après l'heure, avec dérogation et réglage de surtaxe : aucune surtaxe, dérogation consommée", async () => {
    const s = scene(openBackorder(), originReplay(), { late: true, waiver: true, lateFee: true });
    const total = await seenTotalOf(s);

    const result = await s.convert.execute(command({ expectedTotalCents: total }));

    expect(s.placed[0]?.lateFeeCents).toBe(0);
    expect(s.placed[0]?.lateFeeAdjustment).toBeNull();
    expect(s.waivers.consumed).toEqual([{ waiverId: "w_1", orderId: result.id }]);
  });

  it("livrée dans une zone à frais, sous tout franco : frais nul, livraison offerte figée, drapeau posé", async () => {
    const delivered: Partial<AdminBackorderConvertPayload> = {
      fulfillmentMethod: "delivery",
      pickupAddressId: null,
      deliveryAddressId: "addr_bistrot",
      deliveryAddress: {
        label: "",
        ligne1: "2 rue du Test",
        ligne2: "",
        codePostal: "75002",
        ville: "Paris",
        pays: "France",
      },
    };
    const s = scene();
    const total = await seenTotalOf(s, delivered);

    await s.convert.execute(command({ ...delivered, expectedTotalCents: total }));

    const [placed] = s.placed;
    expect(placed?.deliveryFeeCents).toBe(0);
    expect(placed?.deliveryFeeAdjustment).toEqual({ mode: "amount", cents: 800 });
    expect(placed?.freeDelivery).not.toBeNull();
    expect(placed?.deliveryOffered).toBe(true);
  });

  it("en retrait, le drapeau est posé aussi : une livraison décidée plus tard aura le port offert", async () => {
    const s = scene();
    await s.convert.execute(command({ expectedTotalCents: await seenTotalOf(s) }));

    expect(s.placed[0]?.deliveryOffered).toBe(true);
    expect(s.placed[0]?.fulfillmentMethod).toBe("pickup");
    expect(s.placed[0]?.deliveryFeeCents).toBe(0);
  });
});

describe("ConvertBackorderHandler — le reliquat fermé avec la commande", () => {
  it("verrouille le reliquat, écrit la commande, dépense la dérogation, puis ferme le reliquat", async () => {
    const s = scene(openBackorder(), originReplay(), { late: true, waiver: true });
    const total = await seenTotalOf(s);

    const result = await s.convert.execute(command({ expectedTotalCents: total }));

    expect(s.trace).toEqual(["lock-backorder", "place-order", "consume-waiver", "save-backorder"]);
    expect(s.backorders.stateOf(BACKORDER)).toMatchObject({
      state: "converted",
      convertedOrderId: result.id,
      closedByStaffId: STAFF,
    });
    expect(s.journal.facts).toEqual([
      {
        type: "backorder.converted",
        subjectType: "order",
        subjectId: ORIGIN_ORDER,
        payload: {
          subjectLabel: ORIGIN_NUMBER,
          orderId: result.id,
          orderNumber: result.orderNumber,
        },
      },
    ]);
  });

  it("l'acheteur porté est celui du corps, vérifié contre la société", async () => {
    const s = scene();
    await s.convert.execute(command({ expectedTotalCents: await seenTotalOf(s) }));

    expect(s.guard.asked).toContain(BUYER);
    expect(s.placed[0]?.placedByUserId).toBe(BUYER);
    expect(s.placed[0]?.placedByStaffId).toBe(STAFF);
    expect(s.placed[0]?.companyId).toBe("co_bistrot");
  });

  it("double clic sous la même clé : la même commande, une seule écriture", async () => {
    const s = scene();
    const seen = command({ expectedTotalCents: await seenTotalOf(s) });

    const first = await s.convert.execute(seen);
    const second = await s.convert.execute(seen);

    expect(second).toEqual(first);
    expect(s.placed).toHaveLength(1);
    expect(s.backorders.saved).toHaveLength(1);
  });

  it("la même clé sur une saisie corrigée après le succès : refusée, rien de plus", async () => {
    const s = scene();
    await s.convert.execute(command({ expectedTotalCents: await seenTotalOf(s) }));

    await expect(
      s.convert.execute(command({ expectedTotalCents: 0, settlement: "offered" }, "key_1", true)),
    ).rejects.toBeInstanceOf(IntentKeyReusedError);
    expect(s.placed).toHaveLength(1);
  });

  it("un reliquat déjà transformé, sous une autre clé : refus, aucune commande", async () => {
    const s = scene();
    await s.convert.execute(command({ expectedTotalCents: await seenTotalOf(s) }));

    await expect(
      s.convert.execute(command({ expectedTotalCents: 0 }, "key_2")),
    ).rejects.toBeInstanceOf(BackorderClosedError);
    expect(s.placed).toHaveLength(1);
  });

  it("un reliquat abandonné : refus, aucune commande", async () => {
    const abandoned = openBackorder();
    abandoned.abandon(new Date("2026-08-10T12:00:00.000Z"), STAFF);
    const s = scene(abandoned);

    await expect(s.convert.execute(command())).rejects.toBeInstanceOf(BackorderClosedError);
    expect(s.placed).toHaveLength(0);
  });

  it("transformé par un autre entre la lecture et le verrou : refusé sous le verrou, avant la commande", async () => {
    const backorders = new (class extends InMemoryBackorders {
      override loadLocked(id: string): Promise<Backorder | null> {
        this.trace.push("lock-backorder");
        const taken = openBackorder();
        taken.convert("order_other", new Date("2026-08-11T16:00:00.000Z"), "staff_2");
        return Promise.resolve(id === BACKORDER ? taken : null);
      }
    })([openBackorder()]);
    const s = conversionScene({ backorders, replays: new FixedBackorderReplays(originReplay()) });

    await expect(s.convert.execute(command({ expectedTotalCents: 1_266 }))).rejects.toBeInstanceOf(
      BackorderClosedError,
    );
    expect(s.trace).toEqual(["lock-backorder"]);
    expect(s.placed).toHaveLength(0);
  });

  it("un reliquat inconnu : 404 nommé", async () => {
    const s = conversionScene({
      backorders: new InMemoryBackorders([]),
      replays: new FixedBackorderReplays(originReplay()),
    });

    await expect(s.convert.execute(command())).rejects.toBeInstanceOf(BackorderNotFoundError);
  });

  it("un reliquat de particulier : refusé, la saisie de l'équipe exige une société", async () => {
    const s = scene(openBackorder({ companyId: null }));

    await expect(s.convert.execute(command())).rejects.toBeInstanceOf(
      ParticularBackorderNotConvertibleError,
    );
  });

  it("une commande offerte sans le droit d'offrir : refus avant toute lecture", async () => {
    const s = scene();

    await expect(
      s.convert.execute(
        command({
          settlement: "offered",
          offer: { nature: "goodwill", note: "Désolés", notifyCustomer: false },
        }),
      ),
    ).rejects.toBeInstanceOf(OfferNotPermittedError);
  });

  it("le total vu périmé est refusé, et le reliquat reste ouvert", async () => {
    const s = scene();

    await expect(s.convert.execute(command({ expectedTotalCents: 1 }))).rejects.toBeInstanceOf(
      OrderTotalChangedError,
    );
    expect(s.backorders.stateOf(BACKORDER)?.state).toBe("open");
  });
});
