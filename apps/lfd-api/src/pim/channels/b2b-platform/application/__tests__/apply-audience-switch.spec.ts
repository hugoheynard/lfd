import { CommandBus } from "@nestjs/cqrs";
import { Test } from "@nestjs/testing";

import { DeactivateProductCommand } from "../../../../catalogue/product/application/deactivate-product.js";
import { tarte } from "../../../../catalogue/product/application/__tests__/audience-doubles.js";
import type { ProductRecord } from "../../../../catalogue/product/domain/ports/product.repository.js";
import { CatalogueReader } from "../../../../catalogue/shared/domain/ports/catalogue-reader.js";
import type { SalesChannels } from "../../../../catalogue/shared/domain/value-objects/sales-channels.js";
import { B2bMembershipService } from "../../membership/membership.service.js";
import { ApplyAudienceSwitchHandler } from "../apply-audience-switch.js";
import { TableCatalogue } from "./audience-switch-doubles.js";

/**
 * 2b1 — appliquer la bascule : désactive les fiches publiées mais invisibles
 * aujourd'hui (H7), par le geste « désactiver » du catalogue, une fiche à la
 * fois. Rien d'autre.
 */

const SOLD_B2B: SalesChannels = [{ pointOfSaleId: "pos_b2b", context: "b2b" }];

/**
 * Le bus doublé par `useValue`, comme ailleurs dans le dépôt : il retient les
 * commandes, et peut en refuser une. `B2bMembershipService` est concret (il
 * réclame Prisma) : même traitement que dans la suite de l'aperçu.
 */
async function subject(
  products: readonly ProductRecord[],
  channels: ReadonlyMap<string, SalesChannels>,
  boundIds: readonly string[],
  failing: ReadonlySet<string> = new Set(),
) {
  const sent: unknown[] = [];
  const moduleRef = await Test.createTestingModule({
    providers: [
      ApplyAudienceSwitchHandler,
      { provide: CatalogueReader, useValue: new TableCatalogue(products, channels) },
      {
        provide: B2bMembershipService,
        useValue: { publishedProductIds: () => Promise.resolve([...boundIds]) },
      },
      {
        provide: CommandBus,
        useValue: {
          execute: (command: unknown) => {
            sent.push(command);
            return command instanceof DeactivateProductCommand && failing.has(command.id)
              ? Promise.reject(new RangeError("verrou refusé"))
              : Promise.resolve();
          },
        },
      },
    ],
  }).compile();
  return { sent, handler: moduleRef.get(ApplyAudienceSwitchHandler) };
}

function item(id: string, sku: string, status: ProductRecord["status"]): ProductRecord {
  return tarte({ id, sku, status, name: { fr: `Fiche ${sku}` } });
}

const CATALOGUE = [
  item("p_ok", "A-1", "published"),
  item("p_unbound", "B-1", "published"),
  item("p_draft_bound", "C-1", "draft"),
  item("p_closed", "D-1", "published"),
];
const CHANNELS = new Map([
  ["p_ok", SOLD_B2B],
  ["p_unbound", SOLD_B2B],
]);

function apply(failing: ReadonlySet<string> = new Set()) {
  return subject(CATALOGUE, CHANNELS, ["p_ok", "p_draft_bound", "p_closed"], failing);
}

describe("ApplyAudienceSwitchHandler", () => {
  it("désactive les seules fiches publiées et invisibles, une commande chacune, par SKU", async () => {
    const { sent, handler } = await apply();

    const report = await handler.execute();

    expect(sent).toEqual([
      new DeactivateProductCommand("p_unbound"),
      new DeactivateProductCommand("p_closed"),
    ]);
    expect(report).toEqual({
      deactivated: [
        { id: "p_unbound", sku: "B-1", name: "Fiche B-1" },
        { id: "p_closed", sku: "D-1", name: "Fiche D-1" },
      ],
      failed: [],
    });
  });

  /** Une fiche non liée ET fermée n'est désactivée qu'une fois. */
  it("ne désactive pas deux fois une fiche qui cumule les deux écarts", async () => {
    const { sent, handler } = await subject([item("p_both", "E-1", "published")], new Map(), []);

    await handler.execute();

    expect(sent).toEqual([new DeactivateProductCommand("p_both")]);
  });

  it("nomme la fiche en échec et continue avec les suivantes", async () => {
    const { handler } = await apply(new Set(["p_unbound"]));

    const report = await handler.execute();

    expect(report.failed).toEqual([{ id: "p_unbound", sku: "B-1", name: "Fiche B-1" }]);
    expect(report.deactivated.map((entry) => entry.id)).toEqual(["p_closed"]);
  });
});
