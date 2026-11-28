import { weightLabel } from "@lfd/money";

import type {
  DossierUpdatedChange,
  DossierUpdatedLineChange,
  DossierUpdatedShipment,
  ProductionDossierUpdatedMailData,
} from "../../../../mail/channels/templates/b2b-mails.js";
import type { PlanVersionSummaries } from "../../../day/index.js";

/** Le résumé que le noyau publie, lu sur la signature de son port. */
export type PlanVersionSummary = NonNullable<
  ReturnType<Awaited<ReturnType<PlanVersionSummaries["since"]>>["get"]>
>;
type Change = PlanVersionSummary["changes"][number];
type Shipment = Change["shipment"];
type SaleUnit = PlanVersionSummary["production"][number]["saleUnit"];
type LineChange = Extract<Change, { kind: "revised" }>["lines"][number];

/** La partie de l'e-mail que le résumé remplit ; le reste vient du destinataire et du papier. */
export type DossierUpdateSummaryData = Pick<
  ProductionDossierUpdatedMailData,
  "production" | "changes" | "otherChanges" | "resupplies" | "toCheck"
>;

const MINUS = "−";

/** Une quantité dans l'unité de l'article : « 12 », « 1,25 kg ». */
function quantityOf(amount: number, unit: SaleUnit): string {
  return unit === "weight" ? weightLabel(amount) : String(amount);
}

/** L'écart signé : « +15 », « −250 g ». */
function deltaOf(delta: number, unit: SaleUnit): string {
  if (delta === 0) {
    return quantityOf(0, unit);
  }
  return `${delta > 0 ? "+" : MINUS}${quantityOf(Math.abs(delta), unit)}`;
}

const PARIS_TIME = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  hour: "2-digit",
  minute: "2-digit",
});

/** L'heure d'un instant à Paris, comme l'écran la dit : « 19 h 10 ». */
function parisTimeOf(instant: Date): string {
  return PARIS_TIME.format(instant).replace(":", " h ");
}

function shipmentOf(shipment: Shipment): DossierUpdatedShipment {
  return { reference: shipment.reference, rank: shipment.rank };
}

function lineOf(line: LineChange): DossierUpdatedLineChange {
  return {
    productName: line.productName,
    before: quantityOf(line.before, line.saleUnit),
    after: quantityOf(line.after, line.saleUnit),
  };
}

function changeOf(change: Change): DossierUpdatedChange {
  const shipment = shipmentOf(change.shipment);
  switch (change.kind) {
    case "entered":
      return {
        kind: "entered",
        shipment,
        reason: change.reason,
        atLabel: parisTimeOf(change.by.recordedAt),
      };
    case "revised":
    case "modified_during_reopen":
    case "lines_changed":
      return { kind: change.kind, shipment, lines: change.lines.map(lineOf) };
    case "withdrawn":
    case "left_after_withdrawal":
      return { kind: change.kind, shipment };
  }
}

/**
 * **Le résumé mis en données d'e-mail** (`plan-historique-des-tirages.md`,
 * lot H6) : les quantités dites dans l'unité de l'article, les heures à
 * Paris, et aucune date — la demande traverse la boîte d'envoi. Les phrases
 * sont au dictionnaire des e-mails, dans l'ordre de l'écran.
 */
export function dossierUpdateSummaryDataOf(summary: PlanVersionSummary): DossierUpdateSummaryData {
  return {
    production: summary.production.map((effect) => ({
      productName: effect.productName,
      before: quantityOf(effect.before, effect.saleUnit),
      after: quantityOf(effect.after, effect.saleUnit),
      delta: deltaOf(effect.delta, effect.saleUnit),
    })),
    changes: summary.changes.map(changeOf),
    otherChanges: summary.otherChanges,
    resupplies: summary.resupplies.map((resupply) => ({
      kind: resupply.kind,
      siteLabel: resupply.siteLabel,
      name: resupply.name,
    })),
    toCheck: summary.toCheck.map((exit) => shipmentOf(exit.shipment)),
  };
}
