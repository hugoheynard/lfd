import type { DeliveryBinView, DeliveryOrderRoundPlaceView } from "@lfd/contracts";

import { BinLabelsNothingToPrintError } from "../domain/errors/delivery-bin-label-errors.js";
import type { BinLabelSheet, BinLabelsPaper } from "../domain/services/bin-labels-pdf.js";

/** Le chemin d'un bac au back-office — celui qu'ouvre son QR (L4-C13). */
const BIN_PATH = "/livraison/bac/";

/** Ce que l'étiquette lit d'un propriétaire de bacs. */
export interface BinLabelsSource {
  /** La référence de la commande, ou « Transfert <site> ». */
  readonly title: string;
  readonly bins: readonly DeliveryBinView[];
  readonly round: DeliveryOrderRoundPlaceView | null;
  readonly color: string | null;
}

/**
 * **Les étiquettes des bacs, composées** (2026-10-25) — les phrases de la
 * page web qu'elles remplacent (`bin-label.ts` du back-office, lu le
 * 2026-10-25), écrites ici parce que c'est désormais le serveur qui imprime.
 *
 * Seuls les bacs VIVANTS ont une étiquette ; `wanted` (`?bacs=`) en garde une
 * partie, vide : tous. Un QR n'est imprimé que si l'origine du back-office est
 * connue : un QR qui n'ouvre rien vaut moins que le code court, qui reste.
 *
 * @throws {BinLabelsNothingToPrintError} aucun bac vivant à imprimer.
 */
export function binLabelsPaperOf(
  source: BinLabelsSource,
  wanted: readonly string[],
  context: { readonly adminBaseUrl: string | null; readonly printedAt: Date },
): BinLabelsPaper {
  const live = source.bins.filter((bin) => bin.voidedAt === null);
  const chosen = wanted.length === 0 ? live : live.filter((bin) => wanted.includes(bin.binId));
  if (chosen.length === 0) {
    throw new BinLabelsNothingToPrintError(source.title);
  }
  return {
    title: source.title,
    round:
      source.round === null
        ? null
        : { title: roundTitle(source.round), stop: source.round.position },
    color: source.color,
    labels: chosen.map((bin) => labelOf(bin, source.title, context.adminBaseUrl)),
    printedAt: context.printedAt,
  };
}

function labelOf(bin: DeliveryBinView, title: string, base: string | null): BinLabelSheet {
  const half = bin.half === "left" ? "½ gauche" : bin.half === "right" ? "½ droite" : null;
  return {
    reference: bin.transfer === null || bin.transfer === undefined ? bin.reference : title,
    customerLabel: bin.customerLabel,
    indexLabel: `bac ${String(bin.index ?? 0)} / ${String(bin.total)}`,
    kind: half === null ? bin.binType.name : `${bin.binType.name} · ${half}`,
    sharedWith:
      bin.sharedWith === null
        ? null
        : `partagé avec ${bin.sharedWith.reference} · ${bin.sharedWith.customerLabel}`,
    innerBags:
      bin.innerBags <= 0
        ? null
        : `${String(bin.innerBags)} sac${bin.innerBags > 1 ? "s" : ""} dedans`,
    code: bin.code,
    qrUrl:
      base === null
        ? ""
        : `${base.replace(/\/+$/u, "")}${BIN_PATH}${encodeURIComponent(bin.binId)}`,
  };
}

/** « Camion 1 », « Camion 1 · passage 2 » — le titre de tournée de l'écran. */
function roundTitle(round: DeliveryOrderRoundPlaceView): string {
  return round.passage > 1
    ? `${round.vehicleName} · passage ${String(round.passage)}`
    : round.vehicleName;
}
