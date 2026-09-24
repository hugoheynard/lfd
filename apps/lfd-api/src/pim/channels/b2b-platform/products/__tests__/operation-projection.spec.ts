import { Operation } from "../../../../operations/domain/entities/operation.js";
import { OPERATION_SKU_NOT_SHIPPED, projectOperations } from "../operation-projection.js";

/**
 * Les opérations datées dans le fil v11 (D10). Les dates ne sont comparées
 * qu'entre elles et au schéma — jamais à l'horloge : la projection n'en a pas.
 */

function noel(over: { key?: string; skus?: readonly string[]; archived?: boolean } = {}) {
  const operation = Operation.prepare({
    key: over.key ?? "noel-2026",
    name: { fr: "Noël", en: "Christmas" },
    lede: null,
    image: { url: "https://media.example/noel.jpg", alt: "Une bûche" },
    schedule: {
      announceFrom: new Date("2026-10-31T23:00:00.000Z"),
      orderFrom: new Date("2026-11-14T23:00:00.000Z"),
      orderUntil: new Date("2026-12-21T11:00:00.000Z"),
      pickupFrom: "2026-12-20",
      pickupUntil: "2026-12-24",
    },
    audience: "both",
  });
  operation.select(over.skus ?? ["PAT-9-1", "VIE-001-1"]);
  if (over.archived === true) {
    operation.archive(new Date("2026-12-26T00:00:00.000Z"));
  }
  return operation.snapshot();
}

const SHIPPED = new Set(["PAT-9-1", "VIE-001-1"]);

describe("projectOperations — les opérations du fil v11", () => {
  it("porte l'opération telle que l'annonce la montre : trois langues, jours tels quels", () => {
    const { operations, excluded } = projectOperations([noel()], SHIPPED);

    expect(excluded).toEqual([]);
    expect(operations).toEqual([
      {
        key: "noel-2026",
        name: { fr: "Noël", en: "Christmas" },
        lede: null,
        image: { url: "https://media.example/noel.jpg", alt: "Une bûche" },
        announceFrom: "2026-10-31T23:00:00.000Z",
        orderFrom: "2026-11-14T23:00:00.000Z",
        orderUntil: "2026-12-21T11:00:00.000Z",
        pickupFrom: "2026-12-20",
        pickupUntil: "2026-12-24",
        audience: "both",
        skus: ["PAT-9-1", "VIE-001-1"],
      },
    ]);
  });

  it("ne fait pas partir une opération archivée — le récepteur la marquera retirée", () => {
    const archived = noel({ key: "noel-2025", archived: true });

    const { operations } = projectOperations([noel(), archived], SHIPPED);

    expect(operations.map((operation) => operation.key)).toEqual(["noel-2026"]);
  });

  /**
   * 🔴 Un SKU de sélection que l'envoi ne porte pas (non publié, sans prix,
   * canal fermé) ne part pas, et il est NOMMÉ — sinon la bûche manquerait au
   * rayon de Noël sans que personne sache pourquoi.
   */
  it("écarte un SKU que l'envoi ne porte pas, et le nomme avec son motif", () => {
    const { operations, excluded } = projectOperations(
      [noel({ skus: ["VIE-001-1", "PAT-UNPUBLISHED-1", "PAT-9-1"] })],
      SHIPPED,
    );

    expect(operations[0]?.skus).toEqual(["VIE-001-1", "PAT-9-1"]);
    expect(excluded).toEqual([{ sku: "PAT-UNPUBLISHED-1", reason: OPERATION_SKU_NOT_SHIPPED }]);
  });

  it("nomme une seule fois un SKU écarté de deux opérations", () => {
    const { excluded } = projectOperations(
      [noel({ skus: ["PAT-X-1"] }), noel({ key: "galette-2027", skus: ["PAT-X-1"] })],
      SHIPPED,
    );

    expect(excluded).toEqual([{ sku: "PAT-X-1", reason: OPERATION_SKU_NOT_SHIPPED }]);
  });

  it("garde l'ordre du rayon, qui n'a pas d'autre champ que lui", () => {
    const { operations } = projectOperations([noel({ skus: ["VIE-001-1", "PAT-9-1"] })], SHIPPED);

    expect(operations[0]?.skus).toEqual(["VIE-001-1", "PAT-9-1"]);
  });

  it("n'écarte rien d'une archivée : elle ne part pas, ses SKU ne manquent à personne", () => {
    const { excluded } = projectOperations([noel({ skus: ["PAT-X-1"], archived: true })], SHIPPED);

    expect(excluded).toEqual([]);
  });
});
