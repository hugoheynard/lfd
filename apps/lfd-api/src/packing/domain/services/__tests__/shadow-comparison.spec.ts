import type { PackableLine } from "../packable.js";
import { compareShadow } from "../shadow-comparison.js";

function line(orderId: string, sku: string, quantity: number, packable: boolean): PackableLine {
  return {
    orderId,
    reference: `CMD-${orderId}`,
    sku,
    quantity,
    allocated: packable ? quantity : 0,
    packable,
  };
}

describe("compareShadow — ligne à ligne", () => {
  it("deux colisables identiques : aucun écart", () => {
    const lines = [line("a", "CRO", 2, true), line("b", "CRO", 1, false)];
    expect(compareShadow(lines, lines).gaps).toBe(0);
  });

  it("un verdict différent est un écart", () => {
    const result = compareShadow([line("a", "CRO", 2, true)], [line("a", "CRO", 2, false)]);
    expect(result.gaps).toBe(1);
    expect(result.lines[0]?.matches).toBe(false);
  });

  it("une quantité due différente est un écart, même au même verdict", () => {
    expect(compareShadow([line("a", "CRO", 2, false)], [line("a", "CRO", 3, false)]).gaps).toBe(1);
  });

  it("une ligne absente d'un côté est un écart, et nomme le côté qui manque", () => {
    const result = compareShadow([line("a", "CRO", 2, true)], []);
    expect(result.lines).toEqual([
      {
        orderId: "a",
        reference: "CMD-a",
        sku: "CRO",
        legacy: line("a", "CRO", 2, true),
        shadow: null,
        matches: false,
      },
    ]);
    expect(compareShadow([], [line("a", "CRO", 2, true)]).lines[0]?.legacy).toBeNull();
  });

  it("trie par référence puis article, quel que soit l'ordre d'attribution", () => {
    const result = compareShadow(
      [line("b", "PAI", 1, true), line("a", "PAI", 1, true), line("a", "CRO", 1, true)],
      [],
    );
    expect(result.lines.map((entry) => `${entry.reference}:${entry.sku}`)).toEqual([
      "CMD-a:CRO",
      "CMD-a:PAI",
      "CMD-b:PAI",
    ]);
  });
});
