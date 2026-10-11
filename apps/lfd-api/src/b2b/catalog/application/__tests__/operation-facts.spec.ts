import type { SyncOperation } from "@lfd/catalog-sync";

import { operationFactsOf } from "../operation-facts.js";

/** Les instants ne sont comparés qu'à eux-mêmes : la traduction n'a pas d'horloge. */
const RECEIVED = new Date("2026-10-11T08:00:00.000Z");

function noel(image: SyncOperation["image"]): SyncOperation {
  return {
    key: "noel-2026",
    name: { fr: "Noël" },
    lede: null,
    image,
    announceFrom: "2026-10-31T23:00:00.000Z",
    orderFrom: null,
    orderUntil: "2026-12-21T11:00:00.000Z",
    pickupFrom: "2026-12-20",
    pickupUntil: "2026-12-24",
    audience: "both",
    skus: [],
  };
}

describe("operationFactsOf — le point focal de l'image", () => {
  it("garde le point que le push a lu à la médiathèque", () => {
    const facts = operationFactsOf(
      noel({ url: "https://m/noel.jpg", alt: "", focal: { x: 0.1, y: 0.9 } }),
      RECEIVED,
    );

    expect(facts.image).toEqual({ url: "https://m/noel.jpg", alt: "", focal: { x: 0.1, y: 0.9 } });
  });

  it("lit `null` dans un envoi d'avant le point focal (2026-10-11), qui n'en porte pas : la bannière recadre au centre", () => {
    const facts = operationFactsOf(noel({ url: "https://m/noel.jpg", alt: "" }), RECEIVED);

    expect(facts.image?.focal).toBeNull();
  });
});
