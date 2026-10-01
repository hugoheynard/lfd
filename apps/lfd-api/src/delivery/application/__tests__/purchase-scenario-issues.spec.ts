import type { PurchaseTablePayload } from "@lfd/contracts";

import {
  binCandidateView,
  binTypeView,
  vehicleCandidateView,
} from "../commands/__tests__/purchase-scenario-doubles.js";
import { vehicleView } from "../commands/__tests__/routing-doubles.js";
import { selectionIssues } from "../purchase-scenario-issues.js";
import type { PurchaseTableSources } from "../purchase-table-support.js";

const ENDED = new Date(0).toISOString();
const CARGO = { lengthCm: 100, widthCm: 100, heightCm: 50, volumeLiters: 500 };

const SOURCES: PurchaseTableSources = {
  vehicleCandidates: [
    vehicleCandidateView("vc1", "Kangoo"),
    vehicleCandidateView("vc2", "Trafic", ENDED),
  ],
  fleet: [
    { ...vehicleView("v1", "Camion 1"), cargo: CARGO },
    { ...vehicleView("v2", "Camion 2", ENDED), cargo: CARGO },
    vehicleView("v3", "Camion nu"),
  ],
  binCandidates: [
    binCandidateView("bc1", "Caisse"),
    binCandidateView("bc2", "Caisse Dupont 50", ENDED),
  ],
  binTypes: [binTypeView("bt1", "Bac maison"), binTypeView("bt2", "Bac ancien", ENDED)],
};

const selection = (
  vehicles: PurchaseTablePayload["vehicles"],
  formats: PurchaseTablePayload["formats"],
): PurchaseTablePayload => ({ vehicles, formats, gapCm: 1 });

describe("selectionIssues (B-D5)", () => {
  it("ne relève rien quand tout est en cours", () => {
    expect(
      selectionIssues(
        selection(
          [
            { source: "candidate", id: "vc1" },
            { source: "fleet", id: "v1" },
          ],
          [
            { source: "candidate", id: "bc1" },
            { source: "bin_type", id: "bt1" },
          ],
        ),
        SOURCES,
      ),
    ).toEqual([]);
  });

  it("nomme chaque élément archivé, retiré ou sans plancher, avec la phrase du tableau", () => {
    const issues = selectionIssues(
      selection(
        [
          { source: "candidate", id: "vc2" },
          { source: "fleet", id: "v2" },
          { source: "fleet", id: "v3" },
        ],
        [
          { source: "candidate", id: "bc2" },
          { source: "bin_type", id: "bt2" },
        ],
      ),
      SOURCES,
    );

    expect(issues.map(({ kind, name, problem }) => [kind, name, problem])).toEqual([
      ["vehicle_candidate", "Trafic", "archived"],
      ["fleet_vehicle", "Camion 2", "retired"],
      ["fleet_vehicle", "Camion nu", "without_cargo"],
      ["bin_candidate", "Caisse Dupont 50", "archived"],
      ["bin_type", "Bac ancien", "archived"],
    ]);
    expect(issues[3]?.message).toBe(
      "Le format « Caisse Dupont 50 » a été archivé — retirez-le de la sélection.",
    );
    expect(issues[1]?.message).toBe(
      "Le véhicule « Camion 2 » a été retiré de la flotte — retirez-le de la sélection.",
    );
  });

  it("nomme un identifiant introuvable par sa sorte, sans nom à donner", () => {
    const issues = selectionIssues(
      selection([{ source: "candidate", id: "ghost" }], [{ source: "bin_type", id: "nope" }]),
      SOURCES,
    );

    expect(issues).toEqual([
      expect.objectContaining({
        kind: "vehicle_candidate",
        id: "ghost",
        name: null,
        problem: "not_found",
      }),
      expect.objectContaining({ kind: "bin_type", id: "nope", name: null, problem: "not_found" }),
    ]);
  });
});
