import type { DurableEvent, DurableFact } from "../../../platform/outbox/durable-event.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import { instantOf, recordOf, textOf } from "../packing/payload-fields.js";
import { resupplyLinesOf } from "../packing/resupply-list-drawn.event.js";
import type { PlacedResupply } from "./day-resupplies.reader.js";

/** Nom stable du fait, clé de routage vers `@DurableHandler`. */
export const PRODUCTION_RESUPPLY_LAUNCHED = "production.resupply_launched";

/**
 * **Le fournil a lancé un réassort « au plus tôt »** — fait DURABLE (R4a,
 * `reassort-boutiques/plan-au-plus-tot.md` §2), publié dans l'unité de
 * travail du lancement, sous le verrou de la journée.
 *
 * Il porte le réassort tel qu'il est entré au plan — lignes, point,
 * `servedByTransfer`, nom — pour que chaque abonné en tire ce qui le
 * concerne sans relire le fournil. Le commerce y pose l'affichage « Lancé par
 * X à HH:MM » ; le colisage (R4b) et la livraison (R4c) l'écouteront à leur
 * tour, en même temps (S5 de `vitruve`). Le fournil ne sait pas qui écoute.
 *
 * Clé : `production.resupply_launched:<jour>:<resupplyId>`, suffixée
 * `:after-reopening:<instant>` quand la journée a été rouverte avant le
 * lancement — la forme de `ResupplyListDrawnEvent`.
 */
export class ResupplyLaunchedEvent implements DurableEvent {
  constructor(
    /** `AAAA-MM-JJ`. */
    readonly serviceDay: string,
    readonly launchedAt: Date,
    /** L'identifiant staff de qui a lancé. */
    readonly launchedBy: string,
    /** Son nom figé au lancement ; `null` si l'annuaire n'en avait pas. */
    readonly launchedByName: string | null,
    readonly resupply: PlacedResupply,
    /** La dernière réouverture de la journée, ou `null` — n'entre que dans la clé. */
    readonly reopenedAt: Date | null = null,
  ) {}

  durableFact(): DurableFact {
    return {
      type: PRODUCTION_RESUPPLY_LAUNCHED,
      key:
        `${PRODUCTION_RESUPPLY_LAUNCHED}:${this.serviceDay}:${this.resupply.resupplyId}` +
        (this.reopenedAt === null ? "" : `:after-reopening:${this.reopenedAt.toISOString()}`),
      payload: {
        serviceDay: this.serviceDay,
        launchedAt: this.launchedAt.toISOString(),
        launchedBy: this.launchedBy,
        launchedByName: this.launchedByName,
        resupply: { ...this.resupply, lines: this.resupply.lines.map((line) => ({ ...line })) },
      },
    };
  }

  /** @throws {ResupplyLaunchedPayloadError} un payload hors contrat. */
  static fromPayload(payload: Readonly<Record<string, unknown>>): ResupplyLaunchedEvent {
    const serviceDay = textOf(payload["serviceDay"]);
    const launchedAt = instantOf(payload["launchedAt"]);
    const launchedBy = textOf(payload["launchedBy"]);
    const launchedByName = payload["launchedByName"] ?? null;
    const resupply = launchedResupplyOf(payload["resupply"]);
    if (
      serviceDay === null ||
      launchedAt === null ||
      launchedBy === null ||
      (launchedByName !== null && typeof launchedByName !== "string") ||
      resupply === null
    ) {
      throw new ResupplyLaunchedPayloadError();
    }
    return new ResupplyLaunchedEvent(serviceDay, launchedAt, launchedBy, launchedByName, resupply);
  }
}

function launchedResupplyOf(value: unknown): PlacedResupply | null {
  const raw = recordOf(value);
  if (raw === null) {
    return null;
  }
  const resupplyId = textOf(raw["resupplyId"]);
  const siteId = textOf(raw["siteId"]);
  const siteLabel = raw["siteLabel"] ?? null;
  const name = raw["name"] ?? null;
  const servedByTransfer = raw["servedByTransfer"];
  const lines = resupplyLinesOf(raw["lines"]);
  if (
    resupplyId === null ||
    siteId === null ||
    (siteLabel !== null && typeof siteLabel !== "string") ||
    (name !== null && typeof name !== "string") ||
    typeof servedByTransfer !== "boolean" ||
    lines === null
  ) {
    return null;
  }
  return { resupplyId, siteId, siteLabel, name, servedByTransfer, lines };
}

/** Le fait `production.resupply_launched` reçu ne respecte pas son contrat. */
export class ResupplyLaunchedPayloadError extends TechnicalError {
  constructor() {
    super(
      "resupply_launched.payload_invalid",
      "Le fait « réassort lancé » reçu est illisible (journée, instant, auteur, réassort ou " +
        "lignes hors forme) : l'abonné n'a rien posé. Le message reste dans la boîte " +
        "d'envoi ; corriger l'émetteur puis le rejouer depuis la carte de santé.",
    );
  }
}
