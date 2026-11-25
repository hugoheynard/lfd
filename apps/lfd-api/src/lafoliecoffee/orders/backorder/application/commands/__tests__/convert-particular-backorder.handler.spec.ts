import { DirectUnitOfWork } from "../../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../../platform/events/__tests__/recording-publisher.js";
import { inMemoryIntents } from "../../../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import { RecordingJournal } from "../../../../../../platform/journal/__tests__/recording-journal.js";
import { FixedClock } from "../../../../../../platform/time/fixed-clock.js";
import { CustomerCancellationDeadline } from "../../../../cancellation/application/services/customer-cancellation-deadline.js";
import { FixedCancellationSettings } from "../../../../cancellation/application/commands/__tests__/customer-cancellation-doubles.js";
import {
  capturingRepo,
  drafting,
  FixedParticularStandings,
  MEMBER,
  PARTICULAR,
  STAFF,
} from "../../../../application/commands/__tests__/counter-particular-scene.js";
import { RecordingDurable } from "../../../../application/commands/__tests__/durable-doubles.js";
import { OrderCutoffNotice } from "../../../../application/services/order-cutoff-notice.service.js";
import type { OrderToPlace } from "../../../../domain/entities/order.js";
import { CounterBuyerIsCompanyMemberError } from "../../../../domain/errors/shop-till-order-errors.js";
import type { OrderLineSnapshot } from "../../../../domain/value-objects/order-line.js";
import { OrderTotalChangedError } from "../../../../domain/errors/order-total-changed.error.js";
import { CounterParticularNotFoundError } from "../../../../domain/errors/shop-till-order-errors.js";
import { IntentKeyReusedError } from "../../../../../../platform/intent/intent-errors.js";
import { OfferNotPermittedError } from "../../../../domain/errors/order-offer-errors.js";
import { deadlineOf } from "../../../../application/services/__tests__/order-deadline-of.js";
import { InMemoryProductCatalog } from "../../../../../catalog/infrastructure/in-memory-product-catalog.js";
import { Backorder } from "../../../domain/entities/backorder.js";
import {
  BackorderClosedError,
  BackorderNotFoundError,
  CompanyBackorderNeedsStaffEntryError,
} from "../../../domain/errors/backorder-errors.js";
import { BackorderLine } from "../../../domain/value-objects/backorder-line.js";
import {
  BACKORDER,
  FixedBackorderReplays,
  InMemoryBackorders,
  ORIGIN_ORDER,
  openBackorder,
  originLine,
  originReplay,
} from "../../__tests__/backorder-conversion-doubles.js";
import { QuoteParticularBackorderHandler } from "../../queries/quote-particular-backorder.handler.js";
import { QuoteParticularBackorderQuery } from "../../queries/quote-particular-backorder.query.js";
import { ConvertParticularBackorderCommand } from "../convert-particular-backorder.command.js";
import { ConvertParticularBackorderHandler } from "../convert-particular-backorder.handler.js";

/**
 * **Transformer le reliquat d'un particulier** (`documentation/commandes/reliquat/reliquat.md`, § 6.4) :
 * la vraie composition du particulier (scène du comptoir), sous la politique
 * du reliquat — prix d'origine rejoué —, et le reliquat fermé avec la commande.
 *
 * Dates absolues, l'exception écrite : l'horloge est un `FixedClock`, et le
 * jour servi n'est comparé qu'à elle.
 */

const KEY = "0b7d2f8a-2c1e-4a7b-9f51-8c6d2a1e4b30";
const NOW = new Date("2026-01-15T09:00:00.000Z");
/** Le prix d'origine : 1,50 € la pièce, quand le catalogue dit 2,00 €. */
const ORIGIN_UNIT_MILLICENTS = 150_000;
const OFFER = { nature: "goodwill" as const, note: "Le reste d'ORD-12", notifyCustomer: false };

function particularBackorder(): Backorder {
  return Backorder.open({
    id: BACKORDER,
    originOrderId: ORIGIN_ORDER,
    companyId: null,
    buyerUserId: PARTICULAR,
    lines: [BackorderLine.of({ sku: "VIE-001", quantity: 2, saleUnit: "piece" })],
    openedAt: new Date("2026-01-10T10:00:00.000Z"),
  });
}

function scene(
  seeded: Backorder = particularBackorder(),
  originLines: readonly OrderLineSnapshot[] = [
    originLine({
      sku: "VIE-001",
      productName: "Croissant",
      unitPriceMillicents: ORIGIN_UNIT_MILLICENTS,
      vatRate: 0,
      quantity: 5,
    }),
  ],
) {
  const placed: OrderToPlace[] = [];
  const composition = drafting();
  const particulars = new FixedParticularStandings({
    [PARTICULAR]: "particular",
    [MEMBER]: "company_member",
  });
  const backorders = new InMemoryBackorders([seeded]);
  const replays = new FixedBackorderReplays(originReplay({ lines: originLines }));
  const journal = new RecordingJournal();
  const convert = new ConvertParticularBackorderHandler(
    particulars,
    composition,
    capturingRepo(placed),
    new RecordingPublisher(),
    new DirectUnitOfWork(),
    new RecordingDurable(),
    new CustomerCancellationDeadline(new FixedCancellationSettings()),
    inMemoryIntents(),
    new FixedClock(NOW),
    backorders,
    replays,
    journal,
  );
  const quote = new QuoteParticularBackorderHandler(
    particulars,
    composition,
    new OrderCutoffNotice(
      deadlineOf({
        cutoffs: { list: () => Promise.resolve([]) },
        catalog: new InMemoryProductCatalog([]),
      }),
      new FixedClock(NOW),
    ),
    backorders,
    replays,
  );
  return { convert, quote, placed, backorders, journal };
}

const BODY = {
  fulfillmentMethod: "pickup" as const,
  deliveryAddress: null,
  deliveryAddressId: null,
  pickupAddressId: "pickup_1",
  requestedDeliveryDate: "2026-09-01",
  requestedWindow: { start: "07:00", end: "08:00" },
  note: "",
};

const shopTill = (expectedTotalCents: number) => ({
  venue: "shop_till" as const,
  ...BODY,
  expectedTotalCents,
});

describe("ConvertParticularBackorderHandler — réglée en boutique", () => {
  it("passe la commande au prix d'origine, réglée en boutique, port offert, et ferme le reliquat", async () => {
    const { convert, placed, backorders, journal } = scene();

    const result = await convert.execute(
      new ConvertParticularBackorderCommand(STAFF, BACKORDER, shopTill(300), KEY, false),
    );

    expect(result).toEqual({
      id: "order_1",
      orderNumber: "ORD-1",
      venue: "shop_till",
      totalCents: 300,
    });
    expect(placed[0]).toMatchObject({
      companyId: null,
      placedByUserId: PARTICULAR,
      entryOrigin: "counter",
      paymentStatus: "not_required",
      settlementVenue: "shop_till",
      deliveryOffered: true,
      lateFeeCents: 0,
      totalCents: 300,
    });
    expect(placed[0]?.customerCancellableUntil).not.toBeNull();
    expect(backorders.stateOf(BACKORDER)).toMatchObject({
      state: "converted",
      convertedOrderId: "order_1",
      closedByStaffId: STAFF,
    });
    expect(journal.facts.map((fact) => fact.type)).toEqual(["backorder.converted"]);
  });

  it("l'estimation rend le même total que la transformation", async () => {
    const { quote } = scene();

    const view = await quote.execute(
      new QuoteParticularBackorderQuery(STAFF, BACKORDER, { venue: "shop_till", ...BODY }),
    );

    expect(view.refusal).toBeNull();
    expect(view.amounts?.totalCents).toBe(300);
  });

  it("double clic : la même clé rend la même commande, sans en écrire une seconde", async () => {
    const { convert, placed } = scene();
    const command = new ConvertParticularBackorderCommand(
      STAFF,
      BACKORDER,
      shopTill(300),
      KEY,
      false,
    );

    const first = await convert.execute(command);
    const second = await convert.execute(command);

    expect(second).toEqual(first);
    expect(placed).toHaveLength(1);
  });

  it("refuse un reliquat déjà fermé sous une autre clé", async () => {
    const { convert } = scene();
    await convert.execute(
      new ConvertParticularBackorderCommand(STAFF, BACKORDER, shopTill(300), KEY, false),
    );

    await expect(
      convert.execute(
        new ConvertParticularBackorderCommand(STAFF, BACKORDER, shopTill(300), "other-key", false),
      ),
    ).rejects.toBeInstanceOf(BackorderClosedError);
  });

  it("l'acheteur choisi passe le mur du particulier", async () => {
    const { convert, placed } = scene();

    await expect(
      convert.execute(
        new ConvertParticularBackorderCommand(
          STAFF,
          BACKORDER,
          { ...shopTill(300), buyerUserId: MEMBER },
          KEY,
          false,
        ),
      ),
    ).rejects.toBeInstanceOf(CounterBuyerIsCompanyMemberError);
    expect(placed).toEqual([]);
  });

  it("le reliquat d'une société ne prend pas le corps du particulier", async () => {
    const { convert } = scene(openBackorder());

    await expect(
      convert.execute(
        new ConvertParticularBackorderCommand(STAFF, BACKORDER, shopTill(0), KEY, false),
      ),
    ).rejects.toBeInstanceOf(CompanyBackorderNeedsStaffEntryError);
  });
});

describe("ConvertParticularBackorderHandler — offerte", () => {
  it("offre la commande au prix d'origine, sous le droit d'offrir", async () => {
    const { convert, placed, backorders } = scene();

    const result = await convert.execute(
      new ConvertParticularBackorderCommand(
        STAFF,
        BACKORDER,
        { venue: "offered", ...BODY, offer: OFFER, expectedTotalCents: 0 },
        KEY,
        true,
      ),
    );

    expect(result).toMatchObject({ venue: "offered", totalCents: 0 });
    expect(placed[0]).toMatchObject({
      deliveryOffered: true,
      settlementVenue: null,
      totalCents: 0,
    });
    expect(backorders.stateOf(BACKORDER)?.state).toBe("converted");
  });

  it("sans le droit d'offrir, refuse avant toute lecture", async () => {
    const { convert, placed } = scene();

    await expect(
      convert.execute(
        new ConvertParticularBackorderCommand(
          STAFF,
          BACKORDER,
          { venue: "offered", ...BODY, offer: OFFER, expectedTotalCents: 0 },
          KEY,
          false,
        ),
      ),
    ).rejects.toBeInstanceOf(OfferNotPermittedError);
    expect(placed).toEqual([]);
  });
});

const offered = (expectedTotalCents: number) => ({
  venue: "offered" as const,
  ...BODY,
  offer: OFFER,
  expectedTotalCents,
});

describe("ConvertParticularBackorderHandler — les frontières de l'argent", () => {
  // Régression ciblée : l'arrondi du prix unitaire multiplié par la quantité
  // (9,00 € TTC à 10 % × 12 facturaient 107,98 € au lieu de 108,00). Le reliquat
  // rejoue l'étiquette TTC de l'origine : le total doit rester quantité × étiquette.
  it("rejoue une étiquette TTC d'origine sans arrondi multiplié par la quantité", async () => {
    const publicOrigin = originLine({
      sku: "VIE-001",
      productName: "Croissant",
      vatRate: 10,
      unitPriceMillicents: 818_182,
      unitPriceTtcCents: 900,
      lineTotalTtcCents: 900 * 20,
      quantity: 20,
    });
    const twelve = Backorder.open({
      id: BACKORDER,
      originOrderId: ORIGIN_ORDER,
      companyId: null,
      buyerUserId: PARTICULAR,
      lines: [BackorderLine.of({ sku: "VIE-001", quantity: 12, saleUnit: "piece" })],
      openedAt: new Date("2026-01-10T10:00:00.000Z"),
    });
    const { convert, placed } = scene(twelve, [publicOrigin]);

    await convert.execute(
      new ConvertParticularBackorderCommand(STAFF, BACKORDER, shopTill(10_800), KEY, false),
    );

    expect(placed[0]?.totalCents).toBe(10_800);
  });

  // Un refus s'assert en trois temps : l'erreur, aucune écriture, aucun fait.
  it("un total vu faux refuse, laisse le reliquat ouvert et ne trace rien", async () => {
    const { convert, placed, backorders, journal } = scene();

    await expect(
      convert.execute(
        new ConvertParticularBackorderCommand(STAFF, BACKORDER, shopTill(299), KEY, false),
      ),
    ).rejects.toBeInstanceOf(OrderTotalChangedError);

    expect(placed).toEqual([]);
    expect(backorders.stateOf(BACKORDER)?.state).toBe("open");
    expect(backorders.saved).toEqual([]);
    expect(journal.facts).toEqual([]);
  });

  it("un refus de total ne consomme pas la clé : le bon total, sous la même clé, passe", async () => {
    const { convert, placed } = scene();
    await expect(
      convert.execute(
        new ConvertParticularBackorderCommand(STAFF, BACKORDER, shopTill(0), KEY, false),
      ),
    ).rejects.toBeInstanceOf(OrderTotalChangedError);

    const result = await convert.execute(
      new ConvertParticularBackorderCommand(STAFF, BACKORDER, shopTill(300), KEY, false),
    );

    expect(result.totalCents).toBe(300);
    expect(placed).toHaveLength(1);
  });

  // L'offerte vaut zéro : un total vu qui reprend le prix public est périmé.
  it("une offerte dont le total vu n'est pas zéro refuse", async () => {
    const { convert, placed, backorders } = scene();

    await expect(
      convert.execute(
        new ConvertParticularBackorderCommand(STAFF, BACKORDER, offered(300), KEY, true),
      ),
    ).rejects.toBeInstanceOf(OrderTotalChangedError);

    expect(placed).toEqual([]);
    expect(backorders.stateOf(BACKORDER)?.state).toBe("open");
  });

  it("la même clé sur un panier corrigé après un succès est refusée, sans seconde commande", async () => {
    const { convert, placed } = scene();
    await convert.execute(
      new ConvertParticularBackorderCommand(STAFF, BACKORDER, shopTill(300), KEY, false),
    );

    await expect(
      convert.execute(
        new ConvertParticularBackorderCommand(
          STAFF,
          BACKORDER,
          { ...shopTill(300), requestedDeliveryDate: "2026-09-02" },
          KEY,
          false,
        ),
      ),
    ).rejects.toBeInstanceOf(IntentKeyReusedError);
    expect(placed).toHaveLength(1);
  });

  it("offerte, double clic : la même clé rend la même commande, une seule écrite", async () => {
    const { convert, placed } = scene();
    const command = new ConvertParticularBackorderCommand(STAFF, BACKORDER, offered(0), KEY, true);

    const first = await convert.execute(command);
    const second = await convert.execute(command);

    expect(second).toEqual(first);
    expect(placed).toHaveLength(1);
  });

  it("offerte sur un reliquat déjà fermé sous une autre clé : refus", async () => {
    const { convert, placed } = scene();
    await convert.execute(
      new ConvertParticularBackorderCommand(STAFF, BACKORDER, shopTill(300), KEY, false),
    );

    await expect(
      convert.execute(
        new ConvertParticularBackorderCommand(STAFF, BACKORDER, offered(0), "other-key", true),
      ),
    ).rejects.toBeInstanceOf(BackorderClosedError);
    expect(placed).toHaveLength(1);
  });

  it("sans le droit d'offrir, une réglée en boutique n'est pas bridée", async () => {
    const { convert } = scene();

    await expect(
      convert.execute(
        new ConvertParticularBackorderCommand(STAFF, BACKORDER, shopTill(300), KEY, false),
      ),
    ).resolves.toMatchObject({ venue: "shop_till" });
  });

  it("l'offerte aussi passe le mur du particulier", async () => {
    const { convert, placed, backorders } = scene();

    await expect(
      convert.execute(
        new ConvertParticularBackorderCommand(
          STAFF,
          BACKORDER,
          { ...offered(0), buyerUserId: MEMBER },
          KEY,
          true,
        ),
      ),
    ).rejects.toBeInstanceOf(CounterBuyerIsCompanyMemberError);
    expect(placed).toEqual([]);
    expect(backorders.stateOf(BACKORDER)?.state).toBe("open");
  });

  it("un acheteur sans fiche est refusé, nommé, sans rien écrire", async () => {
    const { convert, placed } = scene();

    await expect(
      convert.execute(
        new ConvertParticularBackorderCommand(
          STAFF,
          BACKORDER,
          { ...shopTill(300), buyerUserId: "usr_inconnu" },
          KEY,
          false,
        ),
      ),
    ).rejects.toBeInstanceOf(CounterParticularNotFoundError);
    expect(placed).toEqual([]);
  });

  it("un reliquat inconnu est refusé nommément", async () => {
    const { convert } = scene();

    await expect(
      convert.execute(
        new ConvertParticularBackorderCommand(STAFF, "bo_absent", shopTill(300), KEY, false),
      ),
    ).rejects.toBeInstanceOf(BackorderNotFoundError);
  });
});

describe("QuoteParticularBackorderHandler — frontières", () => {
  it("refuse un reliquat fermé et n'écrit rien", async () => {
    const { convert, quote } = scene();
    await convert.execute(
      new ConvertParticularBackorderCommand(STAFF, BACKORDER, shopTill(300), KEY, false),
    );

    await expect(
      quote.execute(
        new QuoteParticularBackorderQuery(STAFF, BACKORDER, { venue: "shop_till", ...BODY }),
      ),
    ).rejects.toBeInstanceOf(BackorderClosedError);
  });

  it("estime sans écrire : ni commande, ni reliquat fermé, ni fait", async () => {
    const { quote, placed, backorders, journal } = scene();

    await quote.execute(
      new QuoteParticularBackorderQuery(STAFF, BACKORDER, { venue: "shop_till", ...BODY }),
    );

    expect(placed).toEqual([]);
    expect(backorders.saved).toEqual([]);
    expect(journal.facts).toEqual([]);
  });

  it("le reliquat d'une société refuse l'estimation du particulier", async () => {
    const { quote } = scene(openBackorder());

    await expect(
      quote.execute(
        new QuoteParticularBackorderQuery(STAFF, BACKORDER, { venue: "shop_till", ...BODY }),
      ),
    ).rejects.toBeInstanceOf(CompanyBackorderNeedsStaffEntryError);
  });

  it("l'estimation d'une offerte dit le même prix d'origine que la réglée", async () => {
    const { quote } = scene();

    const view = await quote.execute(
      new QuoteParticularBackorderQuery(STAFF, BACKORDER, { venue: "offered", ...BODY }),
    );

    expect(view.amounts?.totalCents).toBe(300);
  });
});
