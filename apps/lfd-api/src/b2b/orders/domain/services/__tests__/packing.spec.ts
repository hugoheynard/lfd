import type { OrderStatus } from "@lfd/contracts";

import { packingBlocker, type PackingSubject } from "../packing.js";

function subject(overrides: Partial<PackingSubject> = {}): PackingSubject {
  return { status: "placed", readyAt: null, ...overrides };
}

describe("packingBlocker", () => {
  it("laisse déclarer prête une commande passée qui ne l'est pas encore", () => {
    expect(packingBlocker(subject())).toBeNull();
  });

  it.each<OrderStatus>(["placed", "confirmed", "in_production"])(
    "laisse passer l'état %s — l'atelier ne clique pas « je commence »",
    (status) => {
      // Exiger `in_production` fermerait la porte pour de bon : aucune
      // transition automatique n'y mène aujourd'hui.
      expect(packingBlocker(subject({ status }))).toBeNull();
    },
  );

  it("refuse une commande annulée, en le disant", () => {
    expect(packingBlocker(subject({ status: "cancelled" }))).toBe("Cette commande est annulée.");
  });

  it("refuse un brouillon", () => {
    expect(packingBlocker(subject({ status: "draft" }))).toBe(
      "Cette commande n'est pas encore passée.",
    );
  });

  it("refuse de RECULER depuis une commande déjà remise", () => {
    // Les états ne reculent jamais : le colisage constate la fin d'une
    // fabrication, il ne peut pas défaire une remise qui a eu lieu.
    expect(packingBlocker(subject({ status: "fulfilled" }))).toBe(
      "Cette commande a déjà été remise.",
    );
  });

  it("refuse un second colisage, et ne se tait pas", () => {
    expect(packingBlocker(subject({ readyAt: new Date() }))).toBe(
      "Cette commande est déjà déclarée prête.",
    );
  });

  it("donne toujours une PHRASE, jamais un booléen nu", () => {
    // Au fournil, un refus muet oblige à traverser le labo pour demander
    // pourquoi. Chaque refus doit nommer son cas.
    const refusals = (["cancelled", "draft", "fulfilled"] as const).map((status) =>
      packingBlocker(subject({ status })),
    );

    expect(refusals.every((reason) => reason !== null && reason.trim() !== "")).toBe(true);
  });
});
