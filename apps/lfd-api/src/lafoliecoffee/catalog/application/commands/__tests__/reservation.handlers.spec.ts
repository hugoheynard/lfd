import { CatalogItemNotFoundError } from "../../../domain/errors/catalog-not-found.error.js";
import { ReservationCompanyNotFoundError } from "../../../domain/errors/made-to-order-errors.js";
import { ReleaseArticleCommand } from "../release-article.command.js";
import { ReleaseArticleHandler } from "../release-article.handler.js";
import { ReserveArticleCommand } from "../reserve-article.command.js";
import { ReserveArticleHandler } from "../reserve-article.handler.js";
import { facts, NAME, SKU } from "./catalog-decision-doubles.js";
import {
  buildMadeToOrder,
  COMPANY,
  COMPANY_NAME,
  KnownCompanies,
  NOW,
} from "./made-to-order-doubles.js";

const STAFF = "fiche-1";

function setup() {
  const doubles = buildMadeToOrder();
  const { items, reservations, companies, events, uow, clock } = doubles;
  return {
    ...doubles,
    reserve: new ReserveArticleHandler(items, reservations, companies, events, uow, clock),
    release: new ReleaseArticleHandler(items, reservations, companies, events, uow),
  };
}

const reservedFact = (type: string, companyName: string | null) => ({
  type,
  subjectType: "catalog_item",
  subjectId: SKU,
  payload: { subjectLabel: NAME, sku: SKU, companyId: COMPANY, companyName },
});

describe("ReserveArticleHandler — réserver un article à une société", () => {
  it("écrit la réservation à l'instant de l'horloge, par la fiche staff, puis le fait", async () => {
    const { reserve, reservations, events, steps } = setup();

    await reserve.execute(new ReserveArticleCommand(SKU, COMPANY, STAFF));

    expect(steps).toEqual([`reserve:${SKU}:${COMPANY}`, "journal:catalog_item.reserved"]);
    expect([...reservations.rows.values()]).toEqual([
      { sku: SKU, companyId: COMPANY, reservedAt: NOW, reservedBy: STAFF },
    ]);
    expect(facts(events)).toEqual([reservedFact("catalog_item.reserved", COMPANY_NAME)]);
  });

  it("réserver deux fois n'écrit pas de second fait", async () => {
    const { reserve, events } = setup();
    await reserve.execute(new ReserveArticleCommand(SKU, COMPANY, STAFF));

    await reserve.execute(new ReserveArticleCommand(SKU, COMPANY, STAFF));

    expect(events.factTypes()).toEqual(["catalog_item.reserved"]);
  });

  it("refuse une société inconnue, AVANT toute écriture", async () => {
    const { reserve, steps } = setup();

    await expect(
      reserve.execute(new ReserveArticleCommand(SKU, "co_inconnue", STAFF)),
    ).rejects.toBeInstanceOf(ReservationCompanyNotFoundError);
    expect(steps).toEqual([]);
  });

  it("refuse un article qui n'est plus au catalogue", async () => {
    const { reserve } = setup();

    await expect(
      reserve.execute(new ReserveArticleCommand("RETIRE-1", COMPANY, STAFF)),
    ).rejects.toBeInstanceOf(CatalogItemNotFoundError);
  });
});

describe("ReleaseArticleHandler — retirer une réservation", () => {
  it("retire la ligne et journalise la société nommée", async () => {
    const { reserve, release, reservations, events } = setup();
    await reserve.execute(new ReserveArticleCommand(SKU, COMPANY, STAFF));

    await release.execute(new ReleaseArticleCommand(SKU, COMPANY));

    expect(reservations.rows.size).toBe(0);
    expect(facts(events)[1]).toEqual(
      reservedFact("catalog_item.reservation_released", COMPANY_NAME),
    );
  });

  it("retirer ce qui n'est pas réservé n'écrit aucun fait", async () => {
    const { release, events } = setup();

    await release.execute(new ReleaseArticleCommand(SKU, COMPANY));

    expect(events.factTypes()).toEqual([]);
  });

  it("une réservation orpheline part quand même, et son fait ne s'invente pas de nom", async () => {
    const { items, reservations, events, uow } = setup();
    reservations.rows.set(`${SKU}|${COMPANY}`, {
      sku: SKU,
      companyId: COMPANY,
      reservedAt: NOW,
      reservedBy: STAFF,
    });
    const orphan = new ReleaseArticleHandler(
      items,
      reservations,
      new KnownCompanies(new Map()),
      events,
      uow,
    );

    await orphan.execute(new ReleaseArticleCommand(SKU, COMPANY));

    expect(facts(events)).toEqual([reservedFact("catalog_item.reservation_released", null)]);
  });
});
