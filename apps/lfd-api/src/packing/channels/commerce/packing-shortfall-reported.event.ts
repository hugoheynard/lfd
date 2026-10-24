import type { DurableEvent, DurableFact } from "../../../platform/outbox/durable-event.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import {
  instantOf,
  recordOf,
  textOf,
} from "../../../production/channels/packing/payload-fields.js";

/** Nom stable du fait, clé de routage vers `@DurableHandler`. */
export const PACKING_SHORTFALL_REPORTED = "packing.shortfall_reported";

/** Une ligne de la commande au signalement : due, et réellement au bac. */
export interface ShortfallReportedLine {
  readonly sku: string;
  readonly due: number;
  readonly packed: number;
}

/**
 * **« Il manque » — signalé au colisage** (lot E6a,
 * `documentation/commandes/plan-e6-le-depart-incomplet.md` § 3). Le premier
 * fait que le colisage publie POUR le commerce, déclaré dans son canal.
 *
 * La charge : `{ orderId, reference, reportedAt, reportedBy, lines }` — les
 * lignes portent toutes les quantités dues et au bac, complètes comprises.
 *
 * 🔴 **La clé porte l'instant** (`packing.shortfall_reported:<orderId>:<iso>`),
 * et non `shortfall:<orderId>` comme l'écrit le plan : la boîte d'envoi absorbe
 * une clé déjà écrite (`ON CONFLICT (key) DO NOTHING`), et un second
 * signalement, qui doit REMPLACER le premier, serait perdu. Rejouer le même
 * geste au même instant reste absorbé. C'est le commerce qui garde le plus
 * récent (`reportedAt` comparé) : l'ordre de livraison ne fait pas gagner un
 * signal plus ancien.
 */
export class PackingShortfallReportedEvent implements DurableEvent {
  constructor(
    readonly orderId: string,
    readonly reference: string,
    readonly reportedAt: Date,
    /** La fiche staff qui a signalé. */
    readonly reportedBy: string,
    readonly lines: readonly ShortfallReportedLine[],
  ) {}

  durableFact(): DurableFact {
    return {
      type: PACKING_SHORTFALL_REPORTED,
      key: `${PACKING_SHORTFALL_REPORTED}:${this.orderId}:${this.reportedAt.toISOString()}`,
      payload: {
        orderId: this.orderId,
        reference: this.reference,
        reportedAt: this.reportedAt.toISOString(),
        reportedBy: this.reportedBy,
        lines: this.lines.map((line) => ({ sku: line.sku, due: line.due, packed: line.packed })),
      },
    };
  }

  /**
   * Relit le contrat côté abonné.
   *
   * @throws {PackingShortfallPayloadError}
   */
  static fromPayload(payload: Readonly<Record<string, unknown>>): PackingShortfallReportedEvent {
    const orderId = textOf(payload["orderId"]);
    const reference = textOf(payload["reference"]);
    const reportedAt = instantOf(payload["reportedAt"]);
    const reportedBy = textOf(payload["reportedBy"]);
    const lines = linesOf(payload["lines"]);
    if (
      orderId === null ||
      reference === null ||
      reportedAt === null ||
      reportedBy === null ||
      lines === null
    ) {
      throw new PackingShortfallPayloadError("signalé");
    }
    return new PackingShortfallReportedEvent(orderId, reference, reportedAt, reportedBy, lines);
  }
}

function countOf(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function lineOf(value: unknown): ShortfallReportedLine | null {
  const record = recordOf(value);
  if (record === null) {
    return null;
  }
  const sku = textOf(record["sku"]);
  const due = countOf(record["due"]);
  const packed = countOf(record["packed"]);
  return sku === null || due === null || packed === null ? null : { sku, due, packed };
}

function linesOf(value: unknown): readonly ShortfallReportedLine[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  const lines = value.map(lineOf);
  const valid = lines.filter((line): line is ShortfallReportedLine => line !== null);
  return valid.length === lines.length ? valid : null;
}

/** Un fait du manque reçu ne respecte pas son contrat. */
export class PackingShortfallPayloadError extends TechnicalError {
  constructor(what: "signalé" | "effacé") {
    super(
      "packing.shortfall.payload_invalid",
      `Le fait « manque ${what} » reçu du colisage est illisible (commande, référence, instant, auteur ou lignes manquants) : ` +
        "la commande n'a pas été mise à jour. Le message reste dans la boîte d'envoi ; " +
        "corriger l'émetteur puis le rejouer depuis la carte de santé.",
    );
  }
}
