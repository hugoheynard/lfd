import {
  dossierSelectionOf,
  dossierSelectionQuerySchema,
} from "../dossier-selection.query-schema.js";
import { DOSSIER_PARTS } from "../../domain/services/day-dossier-selection.js";

/** La forme de `?parts=&groups=&orders=` sur le dossier du jour. */
describe("dossierSelectionQuerySchema", () => {
  it("sans paramètre, rend le dossier entier", () => {
    const selection = dossierSelectionOf(dossierSelectionQuerySchema.parse({}));
    expect([...selection.parts]).toEqual([...DOSSIER_PARTS]);
    expect(selection.groups).toBe("all");
    expect(selection.orders).toBe("all");
  });

  it("lit les parties et les commandes en liste à virgules ou en paramètre répété", () => {
    const selection = dossierSelectionOf(
      dossierSelectionQuerySchema.parse({ parts: "orders, deliveryNotes", orders: ["a", "b,c"] }),
    );
    expect([...selection.parts]).toEqual(["orders", "deliveryNotes"]);
    expect(selection.orders).toEqual(new Set(["a", "b", "c"]));
  });

  it("ne découpe pas un libellé de rayon sur sa virgule", () => {
    const selection = dossierSelectionOf(
      dossierSelectionQuerySchema.parse({ groups: ["Pains, spéciaux", "Viennoiseries"] }),
    );
    expect(selection.groups).toEqual(new Set(["Pains, spéciaux", "Viennoiseries"]));
  });

  it("refuse une partie inconnue et une liste vide", () => {
    expect(dossierSelectionQuerySchema.safeParse({ parts: "cover,menu" }).success).toBe(false);
    expect(dossierSelectionQuerySchema.safeParse({ parts: "" }).success).toBe(false);
    expect(dossierSelectionQuerySchema.safeParse({ orders: " , " }).success).toBe(false);
    expect(dossierSelectionQuerySchema.safeParse({ groups: "" }).success).toBe(false);
  });
});
