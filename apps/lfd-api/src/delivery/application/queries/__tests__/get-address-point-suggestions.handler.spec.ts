import { addressKeyOf } from "../../../domain/services/address-key.js";
import {
  CARNET,
  FixedGeocodes,
  north,
  parcOrder,
  gesture,
  suggestionScene,
} from "../../__tests__/address-suggestion-doubles.js";
import {
  metersBetween,
  MIN_CONCORDANT,
  MIN_GAP_M,
} from "../../../domain/services/address-point-suggestions.js";
import { GetAddressPointSuggestionsHandler } from "../get-address-point-suggestions.handler.js";

/**
 * **« Carnet à corriger »** (§6) : un centre, un écart, un compte — jamais
 * la position d'un livreur.
 */
function handlerOf(s: ReturnType<typeof suggestionScene>) {
  return new GetAddressPointSuggestionsHandler(
    s.positions,
    s.carnet,
    s.ignored,
    s.geocodes,
    s.clock,
  );
}

describe("GetAddressPointSuggestionsHandler", () => {
  it("quatre remises concordantes à ~120 m : « la porte semble être à 120 m », 4 livraisons", async () => {
    const points = [north(118), north(120), north(122), north(120)];
    const s = suggestionScene(
      points.map((_, i) => parcOrder(`o${String(i)}`)),
      points.map((point, i) => gesture(`o${String(i)}`, point)),
    );

    const view = await handlerOf(s).execute();

    expect(view.minConcordant).toBe(MIN_CONCORDANT);
    expect(view.minGapM).toBe(MIN_GAP_M);
    const [only] = view.suggestions;
    expect(view.suggestions).toHaveLength(1);
    expect(metersBetween(only?.suggested ?? CARNET, north(120))).toBeLessThan(0.5);
    expect({ ...only, suggested: null }).toEqual({
      addressId: "a1",
      kind: "door",
      customerLabel: "Hôtel du Parc SAS",
      addressLabel: "Hôtel du Parc",
      addressText: "2 avenue du Parc, 73000 Chambéry",
      suggested: null,
      recorded: CARNET,
      reference: "carnet",
      distanceM: 120,
      concordant: 4,
    });
  });

  it("les arrivées concordantes suggèrent un stationnement, comparé à la porte", async () => {
    const points = [north(200), north(201), north(202)];
    const s = suggestionScene(
      points.map((_, i) => parcOrder(`o${String(i)}`)),
      points.map((point, i) => gesture(`o${String(i)}`, point, "parking")),
    );

    const [only] = (await handlerOf(s).execute()).suggestions;

    expect(only).toEqual(
      expect.objectContaining({ kind: "parking", distanceM: 201, concordant: 3 }),
    );
  });

  it("des gestes sans adresse au carnet (commande non reliée) ne suggèrent rien", async () => {
    const points = [north(118), north(120), north(122)];
    const s = suggestionScene(
      [],
      points.map((point, i) => gesture(`o${String(i)}`, point)),
    );

    expect((await handlerOf(s).execute()).suggestions).toEqual([]);
  });

  it("sans point au carnet, compare au géocodage de l'adresse — sinon à rien", async () => {
    const points = [north(118), north(120), north(122)];
    const s = suggestionScene(
      points.map((_, i) => parcOrder(`o${String(i)}`, null)),
      points.map((point, i) => gesture(`o${String(i)}`, point)),
    );
    const key = addressKeyOf(parcOrder("o0").address);
    const geocoded = new FixedGeocodes(new Map([[key, CARNET]]));

    const [withGeocode] = (
      await new GetAddressPointSuggestionsHandler(
        s.positions,
        s.carnet,
        s.ignored,
        geocoded,
        s.clock,
      ).execute()
    ).suggestions;
    const [withNothing] = (await handlerOf(s).execute()).suggestions;

    expect(withGeocode).toEqual(
      expect.objectContaining({ reference: "geocode", recorded: CARNET, distanceM: 120 }),
    );
    expect(withNothing).toEqual(
      expect.objectContaining({ reference: "none", recorded: null, distanceM: null }),
    );
  });
});
