import { instantToLocal } from "@lfd/contracts";

import type { LoadingRoundRow } from "../ports/delivery-loading.reader.js";
import type { DossierCheck } from "./day-rounds-dossier-checks.js";
import type { RoundPaper, RoundPaperStop } from "./round-paper.js";

/** Un transfert d'une tournée, vers un site, et la couleur de transfert de ce site. */
export interface DispatchTransfer {
  readonly siteLabel: string;
  /** `#rrggbb`, ou `null` : couleur non posée — aucun carré, jamais une teinte devinée. */
  readonly color: string | null;
}

/** Une ligne de la répartition : ce qu'on vérifie d'une tournée avant le départ. */
export interface RoundDispatchRow {
  readonly vehicleName: string;
  readonly passage: number;
  /** `null` : aucun livreur affecté (ou fiche sans nom). */
  readonly driverName: string | null;
  /** L'heure de départ prévue (`HH:MM`, Paris), ou `null` : jamais calculée. */
  readonly departure: string | null;
  readonly stopCount: number;
  /** Les bacs non annulés chargés, et tous les bacs non annulés de ses arrêts. */
  readonly binsLoaded: number;
  readonly binsExpected: number;
  /** L'échéance la plus serrée (`HH:MM`) parmi ses arrêts vivants, ou `null`. */
  readonly tightestDeadline: string | null;
  readonly transfers: readonly DispatchTransfer[];
}

/** Une livraison du jour qu'aucune tournée vivante ne porte. */
export interface UnplacedDelivery {
  readonly reference: string;
  /** `""` : le commerce ne la nomme plus. */
  readonly customerLabel: string;
}

/**
 * **Le dossier des tournées d'un jour** (décision de Hugo du 2026-10-26) : la
 * répartition, les livraisons non placées, les commandes à vérifier, puis la
 * feuille de chaque tournée, dans le même ordre que la répartition.
 */
export interface DayRoundsDossier {
  readonly serviceDay: string;
  readonly printedAt: Date;
  readonly dispatch: readonly RoundDispatchRow[];
  readonly unplaced: readonly UnplacedDelivery[];
  /**
   * Les alertes de l'ancienne feuille de route (2026-10-26), par référence ;
   * vide : rien à vérifier.
   */
  readonly checks: readonly DossierCheck[];
  /** Les feuilles remises aux livreurs, une par tournée, dans l'ordre de `dispatch`. */
  readonly papers: readonly RoundPaper[];
}

/** Une tournée lue pour le dossier : sa feuille, et ce que le dépôt sait de ses bacs. */
export interface DossierRound {
  readonly paper: RoundPaper;
  /** `null` : le dépôt ne la connaît pas — aucun bac compté. */
  readonly loading: LoadingRoundRow | null;
}

export interface DayRoundsDossierInputs {
  readonly serviceDay: string;
  readonly printedAt: Date;
  readonly rounds: readonly DossierRound[];
  /** La couleur de transfert de chaque site, par `siteId` ; absent : aucun carré. */
  readonly siteColors: ReadonlyMap<string, string>;
  readonly unplaced: readonly UnplacedDelivery[];
  readonly checks: readonly DossierCheck[];
}

/**
 * Assemble le dossier. **Ordre** : l'heure de départ prévue, puis le passage ;
 * une tournée sans horaire prévu vient après celles qui en ont un — on ne lui
 * invente pas d'heure —, et l'ordre de lecture (la flotte) départage le reste.
 */
export function dayRoundsDossierOf(inputs: DayRoundsDossierInputs): DayRoundsDossier {
  const ordered = [...inputs.rounds].sort(byDeparture);
  return {
    serviceDay: inputs.serviceDay,
    printedAt: inputs.printedAt,
    dispatch: ordered.map((round) => dispatchRowOf(round, inputs.siteColors)),
    unplaced: inputs.unplaced,
    checks: inputs.checks,
    papers: ordered.map((round) => round.paper),
  };
}

function byDeparture(a: DossierRound, b: DossierRound): number {
  const at = a.paper.planned?.departureAt.getTime() ?? Number.POSITIVE_INFINITY;
  const bt = b.paper.planned?.departureAt.getTime() ?? Number.POSITIVE_INFINITY;
  if (at !== bt) {
    return at < bt ? -1 : 1;
  }
  return a.paper.passage - b.paper.passage;
}

function dispatchRowOf(
  round: DossierRound,
  siteColors: ReadonlyMap<string, string>,
): RoundDispatchRow {
  const { paper } = round;
  const bins = binsOf(round.loading);
  return {
    vehicleName: paper.vehicleName,
    passage: paper.passage,
    driverName: paper.driverName,
    departure:
      paper.planned === null ? null : instantToLocal(paper.planned.departureAt).time.slice(0, 5),
    stopCount: paper.stops.length,
    binsLoaded: bins.loaded,
    binsExpected: bins.expected,
    tightestDeadline: tightestDeadlineOf(paper.stops),
    transfers: (round.loading?.stops ?? []).flatMap((stop) =>
      stop.kind === "transfer"
        ? [
            {
              siteLabel: stop.siteLabel ?? "",
              color: stop.siteId === null ? null : (siteColors.get(stop.siteId) ?? null),
            },
          ]
        : [],
    ),
  };
}

/** Les bacs non annulés de ses arrêts, et ceux qui y sont chargés. */
function binsOf(loading: LoadingRoundRow | null): {
  readonly loaded: number;
  readonly expected: number;
} {
  let loaded = 0;
  let expected = 0;
  for (const stop of loading?.stops ?? []) {
    for (const bin of stop.bins) {
      if (bin.voidedAt === null) {
        expected += 1;
        loaded += stop.loaded.has(bin.id) ? 1 : 0;
      }
    }
  }
  return { loaded, expected };
}

/**
 * La plus serrée des échéances : la fin de fenêtre d'une livraison non
 * annulée, l'heure d'arrivée requise d'un transfert. Un arrêt sans échéance
 * ne compte pas ; une heure illisible non plus.
 */
export function tightestDeadlineOf(stops: readonly RoundPaperStop[]): string | null {
  let best: { readonly minutes: number; readonly time: string } | null = null;
  for (const stop of stops) {
    const time = deadlineOf(stop);
    const minutes = time === null ? null : minutesOf(time);
    if (time !== null && minutes !== null && (best === null || minutes < best.minutes)) {
      best = { minutes, time };
    }
  }
  return best?.time ?? null;
}

function deadlineOf(stop: RoundPaperStop): string | null {
  if (stop.kind === "transfer") {
    return stop.arrivalBy;
  }
  if (stop.kind === "sheet" && !stop.cancelled) {
    return stop.window?.end ?? null;
  }
  return null;
}

const MINUTES_PER_HOUR = 60;

function minutesOf(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/u.exec(time);
  return match === null ? null : Number(match[1]) * MINUTES_PER_HOUR + Number(match[2]);
}
