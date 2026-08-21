import { compareToReference, type MirrorEntry, type ReferenceEntry } from "../catalog-parity.js";

/**
 * Ce que ces tests éprouvent : **ce que le rapport permet de décider**. Un
 * garde-fou qui dit « ça diffère » sans dire où et de combien n'évite rien — il
 * déplace juste l'enquête.
 */

function reference(over: Partial<ReferenceEntry> = {}): ReferenceEntry {
  return { sku: "VIE-001-1", name: "Croissant", priceCents: 200, vatRate: 5.5, ...over };
}

function mirror(over: Partial<MirrorEntry> = {}): MirrorEntry {
  return { sku: "VIE-001-1", name: "Croissant", pimPriceCents: 200, vatRate: 5.5, ...over };
}

describe("compareToReference", () => {
  it("ne dit rien quand le miroir est fidèle", () => {
    const report = compareToReference([reference()], [mirror()]);

    expect(report.inSync).toBe(true);
    expect(report.missing).toEqual([]);
    expect(report.stale).toEqual([]);
  });

  it("nomme ce que le référentiel publie et que la boutique ne vend pas", () => {
    const report = compareToReference([reference()], []);

    expect(report.missing).toEqual(["VIE-001-1"]);
    expect(report.inSync).toBe(false);
  });

  /**
   * L'autre moitié du même défaut, et la plus dangereuse : la boutique continue
   * de vendre un article que le référentiel a retiré.
   */
  it("nomme ce que la boutique vend encore et que le référentiel a retiré", () => {
    const report = compareToReference([], [mirror()]);

    expect(report.stale).toEqual(["VIE-001-1"]);
    expect(report.inSync).toBe(false);
  });

  it("donne les DEUX versions d'un écart de prix, pas juste son existence", () => {
    const report = compareToReference([reference({ priceCents: 220 })], [mirror()]);

    expect(report.priceGaps).toEqual([{ sku: "VIE-001-1", reference: 220, mirror: 200 }]);
  });

  it("voit aussi un nom qui a bougé", () => {
    const report = compareToReference([reference({ name: "Croissant au beurre" })], [mirror()]);

    expect(report.nameGaps).toEqual([
      { sku: "VIE-001-1", reference: "Croissant au beurre", mirror: "Croissant" },
    ]);
  });

  /**
   * **Le test qui porte la décision de fond.** Le prix B2B négocié est une
   * décision de la plateforme, pas une dérive : c'est le prix REÇU qu'on
   * compare. Confondre les deux ferait sonner l'alarme sur chaque client à qui
   * l'on a consenti un tarif — donc tout le temps, donc plus jamais utilement.
   */
  it("ne confond pas une décision commerciale avec une dérive", () => {
    // Le miroir a reçu 200 du référentiel ; la plateforme facture 180.
    // Seul le premier nombre entre dans la comparaison.
    const report = compareToReference(
      [reference({ priceCents: 200 })],
      [mirror({ pimPriceCents: 200 })],
    );

    expect(report.inSync).toBe(true);
  });

  it("compte les deux côtés, pour qu'un écart massif se voie d'un coup d'œil", () => {
    const report = compareToReference([reference(), reference({ sku: "PAI-001-1" })], [mirror()]);

    expect(report.referenceCount).toBe(2);
    expect(report.mirrorCount).toBe(1);
  });
});

describe("l’écart de TVA", () => {
  /**
   * Le trou que la passe adversariale a trouvé : la comparaison prouvait que
   * les deux côtés vendaient le même article au même prix HT, en laissant
   * chacun libre d'y appliquer un taux différent. Un régime révisé dans le
   * référentiel et jamais poussé passait donc pour « en phase ».
   */
  it("dit qu’un taux a bougé sans que la boutique suive", () => {
    const report = compareToReference([reference({ vatRate: 20 })], [mirror({ vatRate: 5.5 })]);

    expect(report.vatGaps).toEqual([{ sku: "VIE-001-1", reference: 20, mirror: 5.5 }]);
    expect(report.inSync).toBe(false);
  });

  it("compte un taux effacé comme un écart, pas comme un silence", () => {
    const report = compareToReference([reference({ vatRate: null })], [mirror({ vatRate: 5.5 })]);

    expect(report.vatGaps).toHaveLength(1);
    expect(report.inSync).toBe(false);
  });

  it("se tait quand les deux côtés portent le même taux", () => {
    expect(compareToReference([reference()], [mirror()]).vatGaps).toEqual([]);
  });
});
