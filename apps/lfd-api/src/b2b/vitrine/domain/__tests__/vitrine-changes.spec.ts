import type { VitrineElementKeys } from "@lfd/contracts";

import { VitrineChanges } from "../vitrine-changes.js";

const NONE: VitrineElementKeys = { items: [], operations: [], shelves: [], texts: [] };

function changes(
  changed: Partial<VitrineElementKeys>,
  removed: Partial<VitrineElementKeys> = {},
): VitrineChanges {
  return VitrineChanges.of({ changed: { ...NONE, ...changed }, removed: { ...NONE, ...removed } });
}

describe("les changements annoncés", () => {
  it("sont vides sans rien, et triés à l'écriture", () => {
    expect(VitrineChanges.none().isEmpty).toBe(true);
    expect(changes({ items: ["B", "A"] }).toShape().changed.items).toEqual(["A", "B"]);
  });

  it("un élément changé ET retiré est lu changé : il existe encore", () => {
    expect(changes({ items: ["A"] }, { items: ["A"] }).toShape().removed.items).toEqual([]);
  });

  it("le dernier mot gagne quand une livraison en attente absorbe la suivante", () => {
    const first = changes({ items: ["A", "B"] }, { texts: ["t1"] });
    const later = changes({ texts: ["t1"] }, { items: ["A"] });
    expect(first.merge(later).toShape()).toEqual({
      changed: { ...NONE, items: ["B"], texts: ["t1"] },
      removed: { ...NONE, items: ["A"] },
    });
  });
});
