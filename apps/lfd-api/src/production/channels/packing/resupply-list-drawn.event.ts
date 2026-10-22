import type { DurableEvent, DurableFact } from "../../../platform/outbox/durable-event.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import { instantOf, piecesOf, recordOf, textOf } from "./payload-fields.js";

/** Nom stable du fait, clé de routage vers `@DurableHandler`. */
export const PRODUCTION_RESUPPLY_LIST_DRAWN = "production.resupply_list_drawn";

/** Une ligne d'un réassort à coliser : l'article, son nom, la quantité demandée. */
export interface ResupplyListLine {
  readonly sku: string;
  readonly productName: string;
  readonly quantity: number;
}

/** Un réassort à coliser, tel que le fournil l'a figé au plan. */
export interface ResupplyToPack {
  /** Identifiant OPAQUE du réassort côté commerce. */
  readonly resupplyId: string;
  /** Le point servi par transfert qui le recevra, opaque. */
  readonly siteId: string;
  /** Son nom figé à l'arrêt ; `null` : inconnu du commerce. */
  readonly siteLabel: string | null;
  /**
   * Le nom du réassort (R1g), figé à l'arrêt ; `null` : sans nom. Absent
   * d'un fait publié avant le champ — relu `null`.
   */
  readonly name: string | null;
  readonly lines: readonly ResupplyListLine[];
}

/**
 * **Un réassort entre dans la liste à coliser** — publié par l'arrêt du plan
 * et sa réannonce, dans leur transaction, à côté des `packing_list_drawn`
 * (réassort, lot R3b, `reassort-boutiques/plan-reapprovisionnement.md` §13.1
 * point 5, §13.3).
 *
 * Seul le réassort d'un point SERVI PAR TRANSFERT est publié (§13.4, Q1
 * révisée) : celui du Labo va de la feuille à la vitrine, sans colisage.
 *
 * La clé est le réassort : `production.resupply_list_drawn:<jour>:<resupplyId>`,
 * suffixée `:after-reopening:<instant>` après une réouverture — même raison
 * que {@link PackingListDrawnEvent} : sans elle, la boîte d'envoi avalerait le
 * second tirage et le colisage ne reverrait jamais la fiche.
 *
 * 🔴 **Il vit dans le CANAL** : le colisage le lit par ce dossier seulement.
 */
export class ResupplyListDrawnEvent implements DurableEvent {
  constructor(
    /** `AAAA-MM-JJ`. */
    readonly serviceDay: string,
    /** L'instant de l'arrêt qui l'a figé, jamais celui d'un rejeu. */
    readonly drawnAt: Date,
    readonly resupply: ResupplyToPack,
    /** La dernière réouverture de la journée, ou `null` — n'entre que dans la clé. */
    readonly reopenedAt: Date | null = null,
  ) {}

  durableFact(): DurableFact {
    return {
      type: PRODUCTION_RESUPPLY_LIST_DRAWN,
      key:
        `${PRODUCTION_RESUPPLY_LIST_DRAWN}:${this.serviceDay}:${this.resupply.resupplyId}` +
        (this.reopenedAt === null ? "" : `:after-reopening:${this.reopenedAt.toISOString()}`),
      payload: {
        serviceDay: this.serviceDay,
        drawnAt: this.drawnAt.toISOString(),
        resupply: {
          ...this.resupply,
          lines: this.resupply.lines.map((line) => ({ ...line })),
        },
      },
    };
  }

  /** @throws {ResupplyListDrawnPayloadError} un payload hors contrat. */
  static fromPayload(payload: Readonly<Record<string, unknown>>): ResupplyListDrawnEvent {
    const serviceDay = textOf(payload["serviceDay"]);
    const drawnAt = instantOf(payload["drawnAt"]);
    const resupply = resupplyOf(payload["resupply"]);
    if (serviceDay === null || drawnAt === null || resupply === null) {
      throw new ResupplyListDrawnPayloadError();
    }
    return new ResupplyListDrawnEvent(serviceDay, drawnAt, resupply);
  }
}

function resupplyOf(value: unknown): ResupplyToPack | null {
  const raw = recordOf(value);
  if (raw === null) {
    return null;
  }
  const resupplyId = textOf(raw["resupplyId"]);
  const siteId = textOf(raw["siteId"]);
  const siteLabel = raw["siteLabel"];
  const name = raw["name"] ?? null;
  const lines = resupplyLinesOf(raw["lines"]);
  if (
    resupplyId === null ||
    siteId === null ||
    (siteLabel !== null && typeof siteLabel !== "string") ||
    (name !== null && typeof name !== "string") ||
    lines === null
  ) {
    return null;
  }
  return { resupplyId, siteId, siteLabel, name, lines };
}

/** Les lignes d'un réassort relues d'un payload, ou `null` hors contrat — partagé avec `ResupplyLaunchedEvent`. */
export function resupplyLinesOf(value: unknown): readonly ResupplyListLine[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  const lines: ResupplyListLine[] = [];
  for (const entry of value) {
    const raw = recordOf(entry);
    const sku = textOf(raw?.["sku"]);
    const productName = raw?.["productName"];
    const quantity = piecesOf(raw?.["quantity"]);
    if (sku === null || typeof productName !== "string" || quantity === null) {
      return null;
    }
    lines.push({ sku, productName, quantity });
  }
  return lines;
}

/** Le fait `production.resupply_list_drawn` reçu ne respecte pas son contrat. */
export class ResupplyListDrawnPayloadError extends TechnicalError {
  constructor() {
    super(
      "resupply_list_drawn.payload_invalid",
      "Le fait « réassort à coliser » reçu est illisible (journée, instant, réassort ou lignes hors " +
        "forme) : le colisage n'a pas ouvert sa fiche. Le message reste dans la boîte d'envoi ; " +
        "corriger l'émetteur puis le rejouer depuis la carte de santé.",
    );
  }
}
