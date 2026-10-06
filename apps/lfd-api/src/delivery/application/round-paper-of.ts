import type { BillingAddressPayload } from "@lfd/contracts";

import type { DeliveryProcedureStep } from "../channels/commerce/index.js";
import type { DepartureSheet } from "../domain/entities/departure-sheet.js";
import type { RoundPaperRow, RoundPaperStopRow } from "../domain/ports/round-paper.reader.js";
import type { RoundPaper, RoundPaperStop } from "../domain/services/round-paper.js";

/** Ce que le papier d'une tournée assemble — les lectures faites au même moment. */
export interface RoundPaperInputs {
  readonly round: RoundPaperRow;
  /** Les feuilles VIVANTES du commerce, pour les arrêts sans instantané (au dépôt). */
  readonly sheets: ReadonlyMap<string, DepartureSheet>;
  /** La procédure vivante par commande ; vide sans le droit de la lire. */
  readonly procedures: ReadonlyMap<string, readonly DeliveryProcedureStep[]>;
  readonly driverName: string | null;
  readonly printedAt: Date;
}

/**
 * **Le papier d'une tournée**, en liste blanche : chaque champ imprimé est
 * nommé ici. Comme « Ma tournée » : l'instantané du départ s'il existe, la
 * feuille vivante du commerce sinon ; la procédure toujours vivante.
 */
export function roundPaperOf(inputs: RoundPaperInputs): RoundPaper {
  const { round } = inputs;
  return {
    vehicleName: round.vehicleName,
    passage: round.passage,
    serviceDay: round.serviceDay,
    driverName: inputs.driverName,
    planned: round.planned,
    stops: round.stops.map((stop) => stopOf(stop, inputs)),
    printedAt: inputs.printedAt,
  };
}

function stopOf(stop: RoundPaperStopRow, inputs: RoundPaperInputs): RoundPaperStop {
  const door = doorOf(stop, inputs.sheets.get(stop.orderId));
  if (door === null) {
    return { kind: "absent", orderId: stop.orderId };
  }
  return {
    kind: "sheet",
    ...door,
    binCodes: stop.binCodes,
    steps: (inputs.procedures.get(stop.orderId) ?? []).map((step) => ({
      title: step.title,
      body: step.body,
    })),
  };
}

type Door = Omit<Extract<RoundPaperStop, { kind: "sheet" }>, "kind" | "binCodes" | "steps">;

/** Figé si la tournée est partie, vivant sinon ; `null` : le commerce ne la connaît pas. */
function doorOf(stop: RoundPaperStopRow, live: DepartureSheet | undefined): Door | null {
  if (stop.departed !== null) {
    const frozen = stop.departed;
    return {
      reference: frozen.reference,
      customerLabel: frozen.customerLabel,
      addressLines: addressLinesOf(frozen.address),
      window: frozen.window,
      contact: frozen.contact,
      signatureRequired: frozen.signatureRequired,
      orderNote: frozen.note,
      addressNote: frozen.addressNote,
      cancelled: live?.status === "cancelled",
    };
  }
  if (live === undefined) {
    return null;
  }
  return {
    reference: live.reference,
    customerLabel: live.customerLabel,
    addressLines: addressLinesOf(live.address),
    window: live.window,
    contact: live.contact,
    signatureRequired: live.signatureRequired,
    orderNote: live.note,
    addressNote: live.addressNote,
    cancelled: live.status === "cancelled",
  };
}

/** Les lignes postales, sans les champs vides — comme la feuille de route. */
function addressLinesOf(address: BillingAddressPayload | null): readonly string[] {
  if (address === null) {
    return [];
  }
  return [address.ligne1, address.ligne2, `${address.codePostal} ${address.ville}`].filter(
    (line) => line.trim() !== "",
  );
}
