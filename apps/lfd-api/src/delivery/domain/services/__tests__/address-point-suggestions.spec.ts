import {
  CLUSTER_RADIUS_M,
  densestCluster,
  MAX_ACCURACY_M,
  metersBetween,
  MIN_CONCORDANT,
  MIN_GAP_M,
  type PointObservation,
  referenceFor,
  suggestionFor,
} from "../address-point-suggestions.js";

/**
 * **Les corrections du carnet suggérées par les livraisons**
 * (`gps-y-aller-et-position.md`, §6) — la règle validée par Hugo le
 * 2026-10-06 : trois gestes concordants, loin du point du carnet.
 */

/** Un degré de latitude ≈ 111 km : 0,0001° ≈ 11 m vers le nord. */
const CARNET = { lat: 45.565, lng: 5.918 };
const north = (meters: number) => ({ lat: CARNET.lat + meters / 111_195, lng: CARNET.lng });
const east = (meters: number, from = CARNET) => ({
  lat: from.lat,
  lng: from.lng + meters / (111_195 * Math.cos((from.lat * Math.PI) / 180)),
});

function seen(
  point: { lat: number; lng: number },
  kind: "door" | "parking" = "door",
): PointObservation {
  return { addressId: "a1", kind, point, accuracyM: 8 };
}

const FROM_CARNET = { point: CARNET, source: "carnet" as const };

describe("metersBetween", () => {
  it("mesure en mètres, à un pour cent près sur cent mètres", () => {
    expect(metersBetween(CARNET, north(100))).toBeCloseTo(100, 0);
    expect(metersBetween(CARNET, east(100))).toBeCloseTo(100, 0);
    expect(metersBetween(CARNET, CARNET)).toBe(0);
  });
});

describe("densestCluster", () => {
  it("rend le centre du groupe le plus dense", () => {
    const cluster = densestCluster([north(118), north(120), north(122), north(400)]);

    expect(cluster?.size).toBe(3);
    expect(metersBetween(cluster?.center ?? CARNET, north(120))).toBeLessThan(1);
  });

  it("rien sous le seuil de concordance", () => {
    expect(densestCluster([north(120), north(121)])).toBeNull();
    expect(MIN_CONCORDANT).toBe(3);
  });
});

describe("suggestionFor — la règle", () => {
  it("trois livraisons concordantes à 120 m du carnet : une suggestion, l'écart et le compte", () => {
    const found = suggestionFor(
      "a1",
      "door",
      [seen(north(118)), seen(north(120)), seen(east(5, north(122)))],
      FROM_CARNET,
      [],
    );

    expect(found?.concordant).toBe(3);
    expect(found?.distanceM).toBeGreaterThan(115);
    expect(found?.distanceM).toBeLessThan(125);
    expect(found?.reference).toEqual(FROM_CARNET);
  });

  it("deux livraisons : rien — deux peuvent être un hasard", () => {
    expect(
      suggestionFor("a1", "door", [seen(north(120)), seen(north(121))], FROM_CARNET, []),
    ).toBeNull();
  });

  it("des livraisons dispersées : rien", () => {
    const scattered = [
      north(100),
      north(100 + 2 * CLUSTER_RADIUS_M),
      north(100 + 4 * CLUSTER_RADIUS_M),
    ];

    expect(
      suggestionFor(
        "a1",
        "door",
        scattered.map((p) => seen(p)),
        FROM_CARNET,
        [],
      ),
    ).toBeNull();
  });

  it("un groupe à moins de MIN_GAP_M du carnet : rien, le carnet est juste", () => {
    const close = [north(MIN_GAP_M - 10), north(MIN_GAP_M - 8), north(MIN_GAP_M - 6)];

    expect(
      suggestionFor(
        "a1",
        "door",
        close.map((p) => seen(p)),
        FROM_CARNET,
        [],
      ),
    ).toBeNull();
  });

  it("ne compte que les gestes de CETTE adresse et de CE genre", () => {
    const others = [
      { ...seen(north(120)), addressId: "a2" },
      seen(north(120), "parking"),
      seen(north(121), "parking"),
    ];

    expect(suggestionFor("a1", "door", [...others, seen(north(122))], FROM_CARNET, [])).toBeNull();
  });

  it("écarte une position annoncée trop imprécise", () => {
    const vague = { ...seen(north(120)), accuracyM: MAX_ACCURACY_M + 1 };

    expect(
      suggestionFor("a1", "door", [vague, seen(north(121)), seen(north(122))], FROM_CARNET, []),
    ).toBeNull();
  });

  it("sans point de comparaison, la suggestion naît, distance inconnue", () => {
    const found = suggestionFor(
      "a1",
      "door",
      [seen(north(120)), seen(north(121)), seen(north(122))],
      { point: null, source: "none" },
      [],
    );

    expect(found?.distanceM).toBeNull();
  });

  it("ignorée au même endroit : pas reproposée, même avec une livraison de plus", () => {
    const observations = [north(118), north(120), north(122), north(121)].map((p) => seen(p));
    const ignored = [{ addressId: "a1", kind: "door" as const, point: north(120) }];

    expect(suggestionFor("a1", "door", observations, FROM_CARNET, ignored)).toBeNull();
  });

  it("ignorée, puis les livraisons concluent ailleurs : reproposée", () => {
    const observations = [north(300), north(301), north(302)].map((p) => seen(p));
    const ignored = [{ addressId: "a1", kind: "door" as const, point: north(120) }];

    expect(suggestionFor("a1", "door", observations, FROM_CARNET, ignored)).not.toBeNull();
  });

  it("une suggestion ignorée d'un AUTRE genre ne masque rien", () => {
    const observations = [north(118), north(120), north(122)].map((p) => seen(p));
    const ignored = [{ addressId: "a1", kind: "parking" as const, point: north(120) }];

    expect(suggestionFor("a1", "door", observations, FROM_CARNET, ignored)).not.toBeNull();
  });
});

describe("referenceFor — à quoi se compare une suggestion", () => {
  const GEOCODED = north(5);
  const PARKING = north(200);

  it("la porte : le carnet, sinon le géocodage, sinon rien", () => {
    expect(referenceFor("door", { door: CARNET, parking: null }, GEOCODED)).toEqual(FROM_CARNET);
    expect(referenceFor("door", { door: null, parking: PARKING }, GEOCODED)).toEqual({
      point: GEOCODED,
      source: "geocode",
    });
    expect(referenceFor("door", { door: null, parking: null }, null)).toEqual({
      point: null,
      source: "none",
    });
  });

  it("le stationnement : celui du carnet, sinon la porte — se garer devant ne demande rien", () => {
    expect(referenceFor("parking", { door: CARNET, parking: PARKING }, null)).toEqual({
      point: PARKING,
      source: "carnet",
    });
    expect(referenceFor("parking", { door: CARNET, parking: null }, null)).toEqual(FROM_CARNET);
  });
});

/**
 * Régression : trois clôtures « sans remise » faites au retour, sur la même
 * adresse, suggéraient le DÉPÔT comme porte du client (audit livraisons,
 * § 3.3 ; Hugo, 2026-10-07).
 */
describe("suggestionFor — les positions relevées au dépôt", () => {
  const depotGestures = [seen(north(120)), seen(north(121)), seen(north(122))];

  it("ne comptent pas : trois clôtures au dépôt ne suggèrent rien", () => {
    expect(suggestionFor("a1", "door", depotGestures, FROM_CARNET, [], north(121))).toBeNull();
  });

  it("comptent dès qu'elles sont à plus de 200 m du dépôt, et quand le dépôt est inconnu", () => {
    expect(suggestionFor("a1", "door", depotGestures, FROM_CARNET, [], north(400))).not.toBeNull();
    expect(suggestionFor("a1", "door", depotGestures, FROM_CARNET, [], null)).not.toBeNull();
  });
});
