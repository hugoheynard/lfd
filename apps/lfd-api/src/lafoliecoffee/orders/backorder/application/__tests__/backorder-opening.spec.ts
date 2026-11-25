import { BackorderRepository } from "../../domain/ports/backorder.repository.js";
import type { Backorder } from "../../domain/entities/backorder.js";
import type { BackorderOrigin } from "../../domain/ports/backorder-origin.reader.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { BackorderOpening } from "../backorder-opening.js";
import { backorderOpeningScene } from "./backorder-doubles.js";

const DECIDED_AT = new Date(5_000);

const ORIGIN: BackorderOrigin = {
  companyId: "co_1",
  buyerUserId: "u_1",
  lines: [
    { sku: "CRO", quantity: 12, saleUnit: "piece" },
    { sku: "PAI", quantity: 4, saleUnit: "piece" },
  ],
};

function birth(departing: readonly { sku: string; quantity: number }[]) {
  return { originOrderId: "ord_1", originReference: "ORD-0001", departing, decidedAt: DECIDED_AT };
}

describe("BackorderOpening — la naissance du reliquat", () => {
  it("ouvre un reliquat du reste, recopie société et acheteur, et l'inscrit au journal", async () => {
    const { origins, backorders, journal, opening } = backorderOpeningScene(ORIGIN);

    await opening.openAfter(
      birth([
        { sku: "CRO", quantity: 9 },
        { sku: "PAI", quantity: 4 },
      ]),
    );

    expect(origins.asked).toEqual(["ord_1"]);
    expect(backorders.saved).toHaveLength(1);
    expect(backorders.saved[0]).toMatchObject({
      originOrderId: "ord_1",
      companyId: "co_1",
      buyerUserId: "u_1",
      state: "open",
      createdAt: DECIDED_AT,
      lines: [{ sku: "CRO", quantity: 3, saleUnit: "piece" }],
    });
    expect(journal.facts).toEqual([
      {
        type: "backorder.opened",
        subjectType: "order",
        subjectId: "ord_1",
        payload: {
          subjectLabel: "ORD-0001",
          lines: [{ sku: "CRO", quantity: 3, saleUnit: "piece" }],
        },
      },
    ]);
  });

  it("tout est parti : aucun reliquat, rien au journal", async () => {
    const { backorders, journal, opening } = backorderOpeningScene(ORIGIN);

    await opening.openAfter(
      birth([
        { sku: "CRO", quantity: 12 },
        { sku: "PAI", quantity: 4 },
      ]),
    );

    expect(backorders.saved).toEqual([]);
    expect(journal.facts).toEqual([]);
  });

  // Décision 13 : un particulier a son reliquat, que l'équipe transforme en
  // commande réglée en boutique ou offerte, ou abandonne.
  it("une origine sans société (un particulier) ouvre son reliquat, sans société", async () => {
    const { backorders, journal, opening } = backorderOpeningScene({ ...ORIGIN, companyId: null });

    await opening.openAfter(birth([{ sku: "CRO", quantity: 9 }]));

    expect(backorders.saved).toHaveLength(1);
    expect(backorders.saved[0]).toMatchObject({
      companyId: null,
      buyerUserId: "u_1",
      state: "open",
      lines: [
        { sku: "CRO", quantity: 3, saleUnit: "piece" },
        { sku: "PAI", quantity: 4, saleUnit: "piece" },
      ],
    });
    expect(journal.facts.map((fact) => fact.type)).toEqual(["backorder.opened"]);
  });

  it("une origine introuvable n'ouvre rien", async () => {
    const { backorders, opening } = backorderOpeningScene(null);

    await opening.openAfter(birth([{ sku: "CRO", quantity: 9 }]));

    expect(backorders.saved).toEqual([]);
  });

  // Au poids, la quantité est en GRAMMES des deux côtés : 2,5 kg commandés,
  // 1,5 kg partis -> 1 000 g de reste, et l'unité suit la ligne d'origine.
  it("un article au poids garde son unité et son reste en grammes", async () => {
    const { backorders, opening } = backorderOpeningScene({
      ...ORIGIN,
      lines: [{ sku: "FAR", quantity: 2500, saleUnit: "weight" }],
    });

    await opening.openAfter(birth([{ sku: "FAR", quantity: 1500 }]));

    expect(backorders.saved[0]?.lines).toEqual([
      { sku: "FAR", quantity: 1000, saleUnit: "weight" },
    ]);
  });

  // Un départ qui cite un article que la commande n'a pas, ou qui dépasse le
  // commandé, ne fabrique ni ligne négative ni ligne fantôme.
  it("ignore un article parti qui n'est pas commandé et ne descend jamais sous zéro", async () => {
    const { backorders, journal, opening } = backorderOpeningScene(ORIGIN);

    await opening.openAfter(
      birth([
        { sku: "INCONNU", quantity: 5 },
        { sku: "CRO", quantity: 20 },
        { sku: "PAI", quantity: 1 },
      ]),
    );

    expect(backorders.saved[0]?.lines).toEqual([{ sku: "PAI", quantity: 3, saleUnit: "piece" }]);
    expect(journal.types()).toEqual(["backorder.opened"]);
  });

  it("un départ vide laisse toute la commande en reliquat", async () => {
    const { backorders, opening } = backorderOpeningScene(ORIGIN);

    await opening.openAfter(birth([]));

    expect(backorders.saved[0]?.lines).toEqual([
      { sku: "CRO", quantity: 12, saleUnit: "piece" },
      { sku: "PAI", quantity: 4, saleUnit: "piece" },
    ]);
  });

  // Le fait annonce un reliquat qui existe : si l'écriture échoue, rien n'est
  // tracé (l'unité de travail de l'appelant ne le retirerait pas du journal
  // en mémoire).
  it("une écriture qui échoue ne laisse aucun fait au journal", async () => {
    const { journal, origins } = backorderOpeningScene(ORIGIN);
    class FailingBackorders extends BackorderRepository {
      load(): Promise<Backorder | null> {
        return Promise.resolve(null);
      }
      loadLocked(): Promise<Backorder | null> {
        return Promise.resolve(null);
      }
      loadLockedByOrigin(): Promise<Backorder | null> {
        return Promise.resolve(null);
      }
      save(): Promise<void> {
        return Promise.reject(new RangeError("base indisponible"));
      }
    }
    const opening = new BackorderOpening(
      origins,
      new FailingBackorders(),
      journal,
      new FixedIdGenerator("bo"),
    );

    await expect(opening.openAfter(birth([{ sku: "CRO", quantity: 9 }]))).rejects.toBeInstanceOf(
      RangeError,
    );
    expect(journal.types()).toEqual([]);
  });

  it("l'ordre : écriture du reliquat, puis fait au journal", async () => {
    const trace: string[] = [];
    const { journal, opening } = backorderOpeningScene(ORIGIN, trace);

    await opening.openAfter(birth([{ sku: "CRO", quantity: 9 }]));

    expect(trace).toEqual(["save-backorder"]);
    expect(journal.types()).toEqual(["backorder.opened"]);
  });
});
