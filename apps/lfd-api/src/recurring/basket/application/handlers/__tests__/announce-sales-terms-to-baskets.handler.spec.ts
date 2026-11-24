import { RecordingMail } from "../../../../../mail/channels/requests/__tests__/recording-mail.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { BasketBuyerContacts } from "../../../../channels/commerce/basket-buyer-contacts.js";
import {
  SalesTermsPublishedFact,
  SalesTermsPublishedPayloadError,
} from "../../../../channels/commerce/sales-terms-published.js";
import { InMemoryBaskets } from "../../../../occurrence/application/__tests__/recurring-doubles.js";
import { openBasket } from "../../../domain/entities/__tests__/basket-fixtures.js";
import { BasketMailOrigins } from "../../../domain/ports/basket-mail-origins.js";
import { AnnounceSalesTermsToBaskets } from "../announce-sales-terms-to-baskets.handler.js";

// L'horloge du test : la date d'effet en découle (+ 30 jours), rien n'est comparé au mur.
const NOW = new Date("2026-12-05T08:00:00.000Z");
const EFFECTIVE_ON = "2027-01-04";

class Contacts extends BasketBuyerContacts {
  constructor(private readonly emails: ReadonlyMap<string, string>) {
    super();
  }
  emailOf(userId: string): Promise<string | null> {
    return Promise.resolve(this.emails.get(userId) ?? null);
  }
}

class Origins extends BasketMailOrigins {
  constructor(private readonly base: string | null) {
    super();
  }
  clientBaseUrl(): string | null {
    return this.base;
  }
}

const PUBLISHED = new SalesTermsPublishedFact(
  "salesTermsPro",
  4,
  "file_cgv_4",
  "legal/sales-terms-pro/file_cgv_4.pdf",
  "cgv-professionnels-2026-12-05.pdf",
);

function scene(base: string | null = "https://shop.test") {
  const baskets = new InMemoryBaskets();
  const mail = new RecordingMail();
  const contacts = new Contacts(
    new Map([
      ["user_1", "jeanne@chalet.test"],
      ["user_2", "paul@hotel.test"],
    ]),
  );
  const handler = new AnnounceSalesTermsToBaskets(
    baskets,
    contacts,
    new Origins(base),
    new FixedClock(NOW),
    mail,
  );
  const deliver = (fact = PUBLISHED) =>
    handler.handle({
      eventId: "evt_1",
      type: fact.durableFact().type,
      payload: fact.durableFact().payload,
    });
  return { baskets, mail, deliver };
}

describe("AnnounceSalesTermsToBaskets", () => {
  it("note la version à venir sur chaque panier vivant du texte, date d'effet à +30 jours", async () => {
    const { baskets, deliver } = scene();
    const active = openBasket({ id: "basket_1" });
    const paused = openBasket({ id: "basket_2" });
    paused.pause();
    await baskets.insert(active);
    await baskets.insert(paused);

    await deliver();

    for (const id of ["basket_1", "basket_2"]) {
      const next = baskets.rows.get(id)?.nextSalesTerms;
      expect(next?.revision).toBe(4);
      expect(next?.fileId).toBe("file_cgv_4");
      expect(next?.effectiveOn.toString()).toBe(EFFECTIVE_ON);
    }
    expect(baskets.saved).toEqual(["basket_1", "basket_2"]);
  });

  it("demande un e-mail par acheteur, le PDF joint par référence, sans adresse dans la clé", async () => {
    const { baskets, mail, deliver } = scene();
    await baskets.insert(openBasket({ id: "basket_1" }));
    await baskets.insert(openBasket({ id: "basket_2" }));
    await baskets.insert(openBasket({ id: "basket_3", buyerUserId: "user_2" }));

    await deliver();

    expect(mail.queued).toEqual([
      {
        to: "jeanne@chalet.test",
        template: "customer.recurring-sales-terms-changed",
        data: {
          effectiveOn: EFFECTIVE_ON,
          basketsUrl: "https://shop.test/paniers-recurrents",
          document: {
            fileName: "cgv-professionnels-2026-12-05.pdf",
            pdfStored: { store: "customer-documents", key: "legal/sales-terms-pro/file_cgv_4.pdf" },
          },
          locale: "fr",
        },
        idempotencyKey: "customer.recurring-sales-terms-changed:file_cgv_4:user_1",
        subjects: [
          { type: "recurring_basket", id: "basket_1" },
          { type: "recurring_basket", id: "basket_2" },
        ],
      },
      expect.objectContaining({
        to: "paul@hotel.test",
        idempotencyKey: "customer.recurring-sales-terms-changed:file_cgv_4:user_2",
      }),
    ]);
    expect(mail.queued.some((sent) => sent.idempotencyKey.includes("@"))).toBe(false);
  });

  it("rejoué, le même fait n'annonce rien de plus et ne renvoie pas d'e-mail", async () => {
    const { baskets, mail, deliver } = scene();
    await baskets.insert(openBasket({ id: "basket_1" }));

    await deliver();
    await deliver();

    expect(mail.queued).toHaveLength(1);
    expect(baskets.saved).toEqual(["basket_1"]);
  });

  it("ne touche ni un panier arrêté, ni un panier d'un autre texte", async () => {
    const { baskets, mail, deliver } = scene();
    const stopped = openBasket({ id: "basket_1" });
    stopped.cancel();
    await baskets.insert(stopped);
    await baskets.insert(
      openBasket({ id: "basket_2", salesTerms: { key: "salesTerms", revision: 1, fileId: null } }),
    );

    await deliver();

    expect(baskets.saved).toEqual([]);
    expect(mail.queued).toEqual([]);
  });

  it("une version qui n'est pas plus récente que celle acceptée n'annonce rien", async () => {
    const { baskets, mail, deliver } = scene();
    await baskets.insert(openBasket({ id: "basket_1" }));

    await deliver(
      new SalesTermsPublishedFact("salesTermsPro", 3, "file_x", "legal/x.pdf", "x.pdf"),
    );

    expect(baskets.rows.get("basket_1")?.nextSalesTerms).toBeNull();
    expect(mail.queued).toEqual([]);
  });

  it("un acheteur sans adresse garde l'annonce, sans e-mail", async () => {
    const { baskets, mail, deliver } = scene();
    await baskets.insert(openBasket({ id: "basket_1", buyerUserId: "user_ghost" }));

    await deliver();

    expect(baskets.rows.get("basket_1")?.nextSalesTerms?.revision).toBe(4);
    expect(mail.queued).toEqual([]);
  });

  it("sans adresse de boutique configurée, l'e-mail part sans bouton", async () => {
    const { baskets, mail, deliver } = scene(null);
    await baskets.insert(openBasket({ id: "basket_1" }));

    await deliver();

    expect(mail.queued[0]?.data).toMatchObject({ basketsUrl: "" });
  });

  it("refuse une charge hors forme", async () => {
    const { deliver } = scene();
    const broken = new SalesTermsPublishedFact("salesTermsPro", 0, "f", "k", "n");

    await expect(deliver(broken)).rejects.toBeInstanceOf(SalesTermsPublishedPayloadError);
  });
});
