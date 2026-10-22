import {
  FixedActiveBinTypes,
  FixedMeasuredVehicles,
} from "../../handlers/__tests__/day-readiness-doubles.js";
import { GetCompositionGapsHandler } from "../get-composition-gaps.handler.js";

function gapsOf(vehicles: readonly string[], bins: readonly string[]) {
  return new GetCompositionGapsHandler(
    new FixedMeasuredVehicles(vehicles),
    new FixedActiveBinTypes(bins),
  ).execute();
}

/**
 * Régression : sans véhicule mesuré ni bac en service, la composition
 * automatique échouait dans les journaux seulement, sans rien à l'écran
 * (2026-10-22).
 */
describe("GetCompositionGapsHandler — ce qui empêche de composer", () => {
  it("rien ne manque : liste vide, l'écran ne dit rien", async () => {
    await expect(gapsOf(["v1"], ["b1"])).resolves.toEqual({ gaps: [] });
  });

  it("aucun type de bac en service", async () => {
    await expect(gapsOf(["v1"], [])).resolves.toEqual({ gaps: ["no_active_bin_type"] });
  });

  it("aucun véhicule mesuré", async () => {
    await expect(gapsOf([], ["b1"])).resolves.toEqual({ gaps: ["no_measured_vehicle"] });
  });

  it("les deux manques ensemble, le véhicule d'abord", async () => {
    await expect(gapsOf([], [])).resolves.toEqual({
      gaps: ["no_measured_vehicle", "no_active_bin_type"],
    });
  });
});
