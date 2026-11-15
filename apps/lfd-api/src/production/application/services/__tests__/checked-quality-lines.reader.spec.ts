import { instantToLocal } from "@lfd/contracts";

import { QualityCheck } from "../../../domain/entities/quality-check.js";
import { ServiceDay } from "../../../day/index.js";
import {
  BAGUETTE,
  CheckTable,
  closedDay,
  CROISSANT,
  qualityLinesFrom,
} from "../../__tests__/quality-doubles.js";

/**
 * Le port que la qualité publie pour la fiche d'atelier : les pastilles des
 * lignes, par la règle de la Supervision. Le jour est dérivé de maintenant.
 */
const NOW = new Date();
const DAY = ServiceDay.of(instantToLocal(NOW).day);
const TIRAGE = new Date(NOW.getTime() - 60 * 60 * 1000);

function lineVerdict(
  table: CheckTable,
  id: string,
  sku: string,
  quantitySeen: number,
  verdict: "ok" | "warning" | "blocking",
): void {
  table.rows.set(
    id,
    QualityCheck.render({
      id,
      serviceDay: DAY,
      target: { kind: "line", sku, quantitySeen },
      verdict,
      note: verdict === "ok" ? null : "Croûte pâle",
      checkedBy: "staff_sup",
      checkedAt: NOW,
      photos: [],
    }),
  );
}

describe("CheckedQualityLinesReader — les pastilles que la fiche d'atelier lit", () => {
  it("marque chaque ligne contrôlée de son verdict, triée par SKU", async () => {
    const checks = new CheckTable();
    lineVerdict(checks, "chk_1", CROISSANT, 16, "blocking");
    lineVerdict(checks, "chk_2", BAGUETTE, 2, "warning");

    const lines = await qualityLinesFrom(checks).linesOf(closedDay(DAY, TIRAGE, []));

    expect(lines.map((line) => [line.sku, line.verdict, line.stale])).toEqual([
      [BAGUETTE, "warning", false],
      [CROISSANT, "blocking", false],
    ]);
  });

  it("dit périmé un verdict rendu sur une autre quantité que le compte actuel", async () => {
    const checks = new CheckTable();
    lineVerdict(checks, "chk_1", CROISSANT, 3, "blocking");

    const [line] = await qualityLinesFrom(checks).linesOf(closedDay(DAY, TIRAGE, []));

    expect(line).toMatchObject({ sku: CROISSANT, quantitySeen: 3, stale: true });
  });

  it("ne rend rien pour une journée sans contrôle", async () => {
    const lines = await qualityLinesFrom(new CheckTable()).linesOf(closedDay(DAY, TIRAGE, []));

    expect(lines).toEqual([]);
  });
});
