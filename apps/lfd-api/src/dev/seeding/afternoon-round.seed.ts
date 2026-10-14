import type { DayComposer } from "../../delivery/application/day-composer.js";
import {
  type ComposedRound,
  LOADING_HOUR,
  LOADING_MINUTE,
  readTodayRounds,
} from "./delivery-round-day.seed.js";
import { loadRound } from "./delivery-rounds.seed.js";
import { atHour, isoDay, type SeedContext } from "./order-placing.seed.js";
import { loadTransferBins } from "./transfer-bins.seed.js";

/** Midi : le chargement d'une tournée de l'après-midi, après le retour du matin. */
const AFTERNOON_LOADING_HOUR = 12;

/**
 * **Ce que le semis ne place pas, la composition automatique le place**
 * (Hugo, 2026-10-14 : « une deuxième tournée sur camionnette 1 […] qui se
 * soit calculée seule »).
 *
 * Joué APRÈS le chargement des tournées du matin, et pour une raison du
 * calcul : une camionnette n'est occupée, pour « Proposer », que par une
 * tournée CHARGÉE ou partie (`fleetOccupationOf`, relu le 2026-10-14). Avant
 * le chargement, le calcul la croirait libre dès minuit, et la tournée qu'il
 * ouvrirait ne serait pas chronométrée après le retour de celle du matin.
 *
 * C'est `DayComposer` lui-même — « Proposer » puis « Appliquer », mode réglé,
 * tous les véhicules, puis les transferts internes du jour —, pas une
 * imitation : ce qu'il prend (la livraison de l'après-midi, et les livraisons
 * pas encore prêtes, qui sont aussi à répartir) et où il le met sont SA
 * décision. Les tournées qu'il ouvre sont chargées ensuite, à l'heure du
 * départ de l'après-midi, pour que la journée se lise « prête à partir » ; les
 * transferts internes qu'il a placés reçoivent leurs bacs, chargés à l'heure
 * du matin (`loadTransferBins`).
 *
 * @returns les tournées que la composition a ouvertes, et leurs bacs chargés.
 */
export async function composeRestOfToday(
  context: SeedContext,
  day: { readonly today: Date; readonly composer: DayComposer },
): Promise<{ readonly rounds: readonly ComposedRound[]; readonly loadedBins: number }> {
  const forDay = isoDay(day.today);
  const before = new Set((await readTodayRounds(context, forDay)).map((round) => round.roundId));
  await day.composer.composeDay(forDay);
  const opened = (await readTodayRounds(context, forDay)).filter(
    (round) => !before.has(round.roundId),
  );
  // Le transfert du Village, placé par la même composition : ses bacs.
  let loadedBins = await loadTransferBins(context, {
    forDay,
    at: atHour(day.today, LOADING_HOUR, LOADING_MINUTE),
  });
  const at = atHour(day.today, AFTERNOON_LOADING_HOUR);
  for (const round of opened) {
    loadedBins += (await loadRound(context, { roundId: round.roundId, at }, round.stops))
      .loadedBins;
  }
  return { rounds: opened, loadedBins };
}
