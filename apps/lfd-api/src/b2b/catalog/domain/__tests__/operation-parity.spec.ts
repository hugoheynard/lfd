import { compareOperations, type ReferenceOperation } from "../operation-parity.js";

/** Les dates ne sont comparées qu'entre elles : aucune n'est lue à l'horloge. */
function operation(over: Partial<ReferenceOperation> = {}): ReferenceOperation {
  return {
    key: "noel",
    name: { fr: "Noël" },
    lede: null,
    image: { url: "https://media.test/noel.png", alt: "Bûche", focal: { x: 0.2, y: 0.7 } },
    announceFrom: new Date("2026-12-01T00:00:00.000Z"),
    orderFrom: null,
    orderUntil: new Date("2026-12-20T00:00:00.000Z"),
    pickupFrom: "2026-12-23",
    pickupUntil: "2026-12-24",
    audience: "both",
    skus: ["BUCHE-6"],
    ...over,
  };
}

function changeOf(reference: ReferenceOperation, held: ReferenceOperation): string | undefined {
  return compareOperations([reference], [{ facts: held, withdrawnAt: null }])[0]?.change;
}

describe("compareOperations — le point focal de l'image", () => {
  it("dit inchangée une opération dont l'image garde son point", () => {
    expect(changeOf(operation(), operation())).toBe("unchanged");
  });

  it("dit changée une opération dont le point a bougé à la médiathèque depuis le push", () => {
    const moved = operation({
      image: { url: "https://media.test/noel.png", alt: "Bûche", focal: { x: 0.5, y: 0.1 } },
    });

    expect(changeOf(moved, operation())).toBe("changed");
  });

  it("dit changée une image qui a reçu un point, le centre n'étant pas « personne »", () => {
    const unfocused = operation({
      image: { url: "https://media.test/noel.png", alt: "Bûche", focal: null },
    });

    expect(changeOf(operation(), unfocused)).toBe("changed");
  });

  it("tient pour égaux un point absent et `null` : un envoi d'avant le point n'en portait pas", () => {
    const absent = operation({ image: { url: "https://media.test/noel.png", alt: "Bûche" } });
    const none = operation({
      image: { url: "https://media.test/noel.png", alt: "Bûche", focal: null },
    });

    expect(changeOf(absent, none)).toBe("unchanged");
  });
});
