import { archivedOperationsJson, readArchivedOperations } from "../archived-operations.js";

/** Les instants ne sont comparés qu'à eux-mêmes : la colonne n'a pas d'horloge. */
const ARCHIVED = {
  key: "noel-2026",
  name: { fr: "Noël" },
  lede: null,
  announceFrom: "2026-10-31T23:00:00.000Z",
  orderFrom: null,
  orderUntil: "2026-12-21T11:00:00.000Z",
  pickupFrom: "2026-12-20",
  pickupUntil: "2026-12-24",
  audience: "both",
  skus: ["PAT-9-1"],
  receivedAt: "2026-10-11T08:00:00.000Z",
};

describe("les opérations archivées avec un envoi — le point focal", () => {
  it("relit un envoi archivé avant le point focal, dont l'image n'a pas de point", () => {
    const [operation] =
      readArchivedOperations([{ ...ARCHIVED, image: { url: "https://m/a.jpg", alt: "" } }]) ?? [];

    expect(operation?.image).toEqual({ url: "https://m/a.jpg", alt: "" });
  });

  it("écrit puis relit le point tel quel", () => {
    const [stored] =
      readArchivedOperations([
        { ...ARCHIVED, image: { url: "https://m/a.jpg", alt: "", focal: { x: 0.3, y: 0.4 } } },
      ]) ?? [];
    const [again] =
      readArchivedOperations(archivedOperationsJson(stored === undefined ? [] : [stored])) ?? [];

    expect(again?.image).toEqual({ url: "https://m/a.jpg", alt: "", focal: { x: 0.3, y: 0.4 } });
  });
});
