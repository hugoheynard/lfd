import { forecastMatrix, type DayDemand } from "../production-forecast.js";
import { ServiceRange } from "../../value-objects/service-range.value-object.js";

const WEEK = ServiceRange.of("2026-09-03", "2026-09-09");

/** Une journée de demande. `orders` par défaut à 1 : le compte n'est le sujet
 *  que de deux cas, et l'écrire partout noierait ce qu'ils éprouvent. */
function demand(day: string, items: readonly [string, string, number][], orders = 1): DayDemand {
  return {
    day,
    items: items.map(([sku, productName, quantity]) => ({
      sku,
      productName,
      quantity,
      saleUnit: "piece",
    })),
    orderCount: orders,
  };
}

describe("forecastMatrix", () => {
  it("rend une colonne par jour de la plage, même sans rien à produire", () => {
    const matrix = forecastMatrix(WEEK, [], []);
    expect(matrix.columns).toHaveLength(7);
    expect(matrix.columns.map((column) => column.totalUnits)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(matrix.rows).toEqual([]);
    expect(matrix.totalUnits).toBe(0);
  });

  it("donne à chaque ligne autant de quantités que de colonnes, trous à zéro", () => {
    const matrix = forecastMatrix(WEEK, [], [demand("2026-09-05", [["PAI-BAG", "Baguette", 410]])]);
    expect(matrix.rows).toHaveLength(1);
    expect(matrix.rows[0]?.quantities).toEqual([0, 0, 410, 0, 0, 0, 0]);
    expect(matrix.rows[0]?.totalUnits).toBe(410);
  });

  it("somme un produit présent plusieurs jours", () => {
    const matrix = forecastMatrix(
      WEEK,
      [],
      [
        demand("2026-09-03", [["PAI-BAG", "Baguette", 100]]),
        demand("2026-09-04", [["PAI-BAG", "Baguette", 60]]),
      ],
    );
    expect(matrix.rows[0]?.quantities).toEqual([100, 60, 0, 0, 0, 0, 0]);
    expect(matrix.rows[0]?.totalUnits).toBe(160);
    expect(matrix.totalUnits).toBe(160);
  });

  it("trie les lignes par SKU — deux lectures rendent la même grille", () => {
    const matrix = forecastMatrix(
      WEEK,
      [],
      [
        demand("2026-09-03", [
          ["VIE-CRO", "Croissant", 12],
          ["PAI-BAG", "Baguette", 8],
          ["CHO-TAB", "Tablette", 3],
        ]),
      ],
    );
    expect(matrix.rows.map((row) => row.sku)).toEqual(["CHO-TAB", "PAI-BAG", "VIE-CRO"]);
  });

  /**
   * 🔴 La règle qui fait tout l'écran. À la clôture, les commandes quittent
   * `placed` : sans cet arbitrage, la colonne d'aujourd'hui — close la veille au
   * soir — afficherait zéro tous les matins.
   */
  it("lit le compte ARRÊTÉ sur une journée close, et l'annonce", () => {
    const matrix = forecastMatrix(WEEK, [demand("2026-09-03", [["PAI-BAG", "Baguette", 186]])], []);
    expect(matrix.columns[0]).toEqual({
      date: "2026-09-03",
      totalUnits: 186,
      resupplyUnits: 0,
      orderCount: 1,
      closed: true,
    });
    expect(matrix.rows[0]?.quantities[0]).toBe(186);
  });

  /**
   * ⚠️ Une commande tardive sur une journée close et une commande qu'un abonné
   * défaillant a laissée derrière sont indiscernables ici. On ne les additionne
   * pas : fabriquer deux fois coûte plus cher que quelques pièces manquantes,
   * que la feuille d'atelier du jour montre de toute façon.
   */
  it("n'ajoute pas la demande encore ouverte à une journée déjà arrêtée", () => {
    const matrix = forecastMatrix(
      WEEK,
      [demand("2026-09-03", [["PAI-BAG", "Baguette", 186]])],
      [demand("2026-09-03", [["PAI-BAG", "Baguette", 40]])],
    );
    expect(matrix.columns[0]?.totalUnits).toBe(186);
    expect(matrix.rows[0]?.quantities[0]).toBe(186);
  });

  /**
   * Le compte de commandes suit la MÊME source que les pièces : sur une journée
   * close, c'est le plan arrêté qui dit combien de piles il y a — pas ce que le
   * commerce porte encore.
   */
  it("prend le nombre de commandes à la source qui a gagné", () => {
    const matrix = forecastMatrix(
      WEEK,
      [demand("2026-09-03", [["PAI-BAG", "Baguette", 186]], 12)],
      [
        demand("2026-09-03", [["PAI-BAG", "Baguette", 40]], 3),
        demand("2026-09-04", [["PAI-BAG", "Baguette", 204]], 47),
      ],
    );
    expect(matrix.columns[0]?.orderCount).toBe(12);
    expect(matrix.columns[1]?.orderCount).toBe(47);
  });

  it("ne compte aucune commande sur un jour que personne n'annonce", () => {
    expect(forecastMatrix(WEEK, [], []).columns.map((column) => column.orderCount)).toEqual([
      0, 0, 0, 0, 0, 0, 0,
    ]);
  });

  it("mélange une journée close et une journée ouverte sur la même ligne", () => {
    const matrix = forecastMatrix(
      WEEK,
      [demand("2026-09-03", [["PAI-BAG", "Baguette", 186]])],
      [demand("2026-09-04", [["PAI-BAG", "Baguette", 204]])],
    );
    expect(matrix.rows[0]?.quantities).toEqual([186, 204, 0, 0, 0, 0, 0]);
    expect(matrix.columns.map((column) => column.closed)).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it("ignore une demande hors plage plutôt que de la ranger ailleurs", () => {
    const matrix = forecastMatrix(WEEK, [], [demand("2026-09-20", [["PAI-BAG", "Baguette", 99]])]);
    expect(matrix.totalUnits).toBe(0);
    expect(matrix.rows).toEqual([]);
  });

  it("désigne le jour le plus chargé", () => {
    const matrix = forecastMatrix(
      WEEK,
      [],
      [
        demand("2026-09-03", [["PAI-BAG", "Baguette", 100]]),
        demand("2026-09-05", [["PAI-BAG", "Baguette", 400]]),
        demand("2026-09-06", [["PAI-BAG", "Baguette", 220]]),
      ],
    );
    expect(matrix.peakDate).toBe("2026-09-05");
  });

  it("à égalité, le pic est le jour le plus PROCHE — c'est celui qu'on prépare", () => {
    const matrix = forecastMatrix(
      WEEK,
      [],
      [
        demand("2026-09-04", [["PAI-BAG", "Baguette", 300]]),
        demand("2026-09-08", [["PAI-BAG", "Baguette", 300]]),
      ],
    );
    expect(matrix.peakDate).toBe("2026-09-04");
  });

  it("ne désigne aucun pic sur une plage vide — un mur à zéro pièce n'existe pas", () => {
    expect(forecastMatrix(WEEK, [], []).peakDate).toBeNull();
  });

  it("retient le nom du premier jour où le produit apparaît, le SKU faisant foi", () => {
    const matrix = forecastMatrix(
      WEEK,
      [],
      [
        demand("2026-09-03", [["PAI-BAG", "Baguette", 10]]),
        demand("2026-09-04", [["PAI-BAG", "Baguette tradition", 10]]),
      ],
    );
    expect(matrix.rows).toHaveLength(1);
    expect(matrix.rows[0]?.productName).toBe("Baguette");
  });

  describe("les réassorts pour demain (lot R3d)", () => {
    const resupply = (day: string, quantity: number) => ({
      day,
      items: [{ sku: "PAI-BAG", productName: "Baguette", quantity, saleUnit: "piece" as const }],
    });

    it("ajoute les réassorts envoyés d'une journée ouverte, et en marque la part", () => {
      const matrix = forecastMatrix(
        WEEK,
        [],
        [demand("2026-09-04", [["PAI-BAG", "Baguette", 40]], 3)],
        {
          arrested: [],
          expected: [resupply("2026-09-04", 12)],
        },
      );
      expect(matrix.columns[1]).toMatchObject({ totalUnits: 52, resupplyUnits: 12, orderCount: 3 });
      expect(matrix.rows[0]?.quantities[1]).toBe(52);
      expect(matrix.rows[0]?.resupplyQuantities[1]).toBe(12);
      expect(matrix.totalUnits).toBe(52);
    });

    it("une journée de réassorts seuls a sa colonne, sans commande", () => {
      const matrix = forecastMatrix(WEEK, [], [], {
        arrested: [],
        expected: [resupply("2026-09-05", 7)],
      });
      expect(matrix.columns[2]).toMatchObject({ totalUnits: 7, resupplyUnits: 7, orderCount: 0 });
      expect(matrix.peakDate).toBe("2026-09-05");
    });

    /** Le compte arrêté porte DÉJÀ les réassorts figés (R3a) : les rajouter les ferait produire deux fois. */
    it("une journée close n'ajoute rien : elle marque la part figée, et ignore l'envoyé", () => {
      const matrix = forecastMatrix(
        WEEK,
        [demand("2026-09-03", [["PAI-BAG", "Baguette", 186]])],
        [],
        { arrested: [resupply("2026-09-03", 6)], expected: [resupply("2026-09-03", 99)] },
      );
      expect(matrix.columns[0]).toMatchObject({ totalUnits: 186, resupplyUnits: 6 });
      expect(matrix.rows[0]?.quantities[0]).toBe(186);
      expect(matrix.rows[0]?.resupplyQuantities[0]).toBe(6);
    });

    it("des réassorts figés d'une journée qui n'est pas close ne comptent pas", () => {
      const matrix = forecastMatrix(WEEK, [], [], {
        arrested: [resupply("2026-09-03", 6)],
        expected: [],
      });
      expect(matrix.columns[0]).toMatchObject({ totalUnits: 0, resupplyUnits: 0 });
    });
  });
});
