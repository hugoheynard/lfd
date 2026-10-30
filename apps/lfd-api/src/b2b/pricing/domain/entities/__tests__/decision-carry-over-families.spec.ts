/**
 * **Le report — barème, engagement, gabarit**, en domaine pur
 * (`plan-report-apres-detachement.md`, § 2, R3–R5). La fenêtre et la portée
 * communes sont éprouvées dans `decision-carry-over.spec.ts`.
 *
 * Toutes les dates sont relatives à l'instant figé `NOW`.
 */
import {
  CarriedDecisionClosedError,
  DecisionAlreadyCarriedError,
  DecisionNotOnReferenceError,
} from "../../pricing-errors.js";
import { PriceTemplate } from "../price-template.js";
import { VolumeCommitmentAggregate } from "../volume-commitment.js";
import { VolumeLadderAggregate } from "../volume-ladder.js";

const NOW = new Date("2026-03-01T09:00:00.000Z");
const DAY_MS = 86_400_000;
const days = (n: number): Date => new Date(NOW.getTime() + n * DAY_MS);

const OLD = "CHO-000-2";
const NEW = "CHO-001";
const CARRY = { fromSku: OLD, toSku: NEW };
const ORIGIN = (id: string) => ({ kind: "detached", fromSku: OLD, fromDecisionId: id });

const ladder = () =>
  VolumeLadderAggregate.pose(
    "lad_old",
    {
      scope: { type: "variant", id: OLD },
      audience: { type: "all", id: null },
      unit: "percent",
      tiers: [
        { minQuantity: 10, value: 500 },
        { minQuantity: 50, value: 1_000 },
      ],
      label: "Volume",
      validFrom: days(-10),
      validTo: null,
    },
    "staff|marie",
  );

describe("VolumeLadderAggregate.carriedFrom", () => {
  it("pose un barème neuf, mêmes paliers, sur la nouvelle référence", () => {
    const carried = VolumeLadderAggregate.carriedFrom(
      "lad_new",
      ladder(),
      CARRY,
      "staff|paul",
      NOW,
    );

    expect(carried.asLadder).toMatchObject({
      id: "lad_new",
      scope: { type: "variant", id: NEW },
      tiers: ladder().asLadder.tiers,
      validFrom: NOW,
      validTo: null,
      suspendedFrom: null,
    });
    expect(carried.origin).toEqual(ORIGIN("lad_old"));
  });

  it("un barème en pause naît en pause", () => {
    const carried = VolumeLadderAggregate.carriedFrom(
      "lad_new",
      ladder().pause("staff|marie", days(-1)),
      CARRY,
      "staff|paul",
      NOW,
    );
    expect(carried.status).toBe("paused");
  });

  it("refuse un barème archivé", () => {
    expect(() =>
      VolumeLadderAggregate.carriedFrom(
        "lad_new",
        ladder().archive("s", days(-1), null),
        CARRY,
        "s",
        NOW,
      ),
    ).toThrow(CarriedDecisionClosedError);
  });
});

const commitment = (validFrom = days(-10)) =>
  VolumeCommitmentAggregate.sign(
    "vc_old",
    {
      companyId: "co_1",
      scope: { type: "variant", id: OLD },
      promisedQuantity: 500,
      validFrom,
      validTo: days(60),
    },
    "staff|marie",
  );

describe("VolumeCommitmentAggregate.carriedFrom", () => {
  it("reporte la MÊME promesse : même société, même quantité, fenêtre bornée par l'ancien", () => {
    const carried = VolumeCommitmentAggregate.carriedFrom(
      "vc_new",
      commitment(),
      CARRY,
      "staff|paul",
      NOW,
    );

    expect(carried.asCommitment).toEqual({
      id: "vc_new",
      companyId: "co_1",
      scope: { type: "variant", id: NEW },
      promisedQuantity: 500,
      validFrom: NOW,
      validTo: days(60),
    });
    expect(carried.origin).toEqual(ORIGIN("vc_old"));
  });

  it("garde le début d'un engagement programmé", () => {
    const carried = VolumeCommitmentAggregate.carriedFrom(
      "vc_new",
      commitment(days(7)),
      CARRY,
      "s",
      NOW,
    );
    expect(carried.asCommitment.validFrom).toEqual(days(7));
  });

  it("refuse un engagement clos", () => {
    const closed = commitment().close("staff|marie", days(-1), null);
    expect(() => VolumeCommitmentAggregate.carriedFrom("vc_new", closed, CARRY, "s", NOW)).toThrow(
      CarriedDecisionClosedError,
    );
  });
});

describe("PriceTemplate.replaceSku", () => {
  const template = () =>
    PriceTemplate.compose(
      "tpl_1",
      {
        kind: "mercuriale",
        label: "Hôtels",
        lines: [
          {
            sku: OLD,
            tiers: [{ minQuantity: 1, unitPriceMillicents: 180_000 }],
            plannedVolume: 40,
          },
          {
            sku: "PAI-001",
            tiers: [{ minQuantity: 1, unitPriceMillicents: 90_000 }],
            plannedVolume: null,
          },
        ],
      },
      "staff|marie",
    );

  it("remplace la ligne de l'ancienne référence, paliers et volume prévu compris", () => {
    expect(
      template()
        .replaceSku(OLD, NEW)
        .lines.map((line) => [line.sku, line.plannedVolume]),
    ).toEqual([
      [NEW, 40],
      ["PAI-001", null],
    ]);
  });

  it("refuse un gabarit qui ne porte pas l'ancienne, ou qui porte déjà la nouvelle", () => {
    expect(() => template().replaceSku("AUTRE", NEW)).toThrow(DecisionNotOnReferenceError);
    expect(() => template().replaceSku(OLD, "PAI-001")).toThrow(DecisionAlreadyCarriedError);
  });
});
