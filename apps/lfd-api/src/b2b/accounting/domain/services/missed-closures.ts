import { parisLongDay } from "../errors/collection-errors.js";
import type { AutopilotCoverage } from "../ports/autopilot-coverage.reader.js";
import { closureAfter, type RhythmTimeline } from "./invoicing-closures.js";

/**
 * **Les clôtures manquées** d'une entité avant la clôture `current` (plan
 * `plan-rythme-de-facturation.md`, §14, lot R4b — Hugo, 2026-10-12 : « un lot
 * manqué se signale et se refait à la main »).
 *
 * Une clôture est manquée quand elle suit la borne, précède `current`, et n'a
 * AUCUNE tentative de l'automatisme. La borne est la plus récente de :
 *
 * - la **première tentative** de l'entité — sans elle, rien n'est manqué :
 *   le jour du déploiement ne signale pas toutes les clôtures depuis le
 *   plancher, et une entité qui active l'automatisme ne se voit pas reprocher
 *   les mois d'avant ;
 * - le **plancher** du prélèvement — avant lui, aucun lot n'est possible ;
 * - la clôture du **dernier lot vivant** — un lot, manuel compris, prend les
 *   bons depuis le plancher : il couvre toutes les clôtures jusqu'à la sienne.
 *   C'est ce qui fait reprendre l'automatisme après « Préparer le lot ».
 *
 * Pur. Borné : les clôtures croissent strictement jusqu'à `current`.
 */
export function missedClosures(
  current: Date,
  timeline: RhythmTimeline,
  coverage: AutopilotCoverage,
): readonly Date[] {
  const bound = boundOf(coverage);
  if (bound === null) {
    return [];
  }
  const attempted = new Set(coverage.attemptedClosures.map((closure) => closure.getTime()));
  const missed: Date[] = [];
  for (
    let cursor = closureAfter(bound, timeline);
    cursor.getTime() < current.getTime();
    cursor = closureAfter(cursor, timeline)
  ) {
    if (!attempted.has(cursor.getTime())) {
      missed.push(cursor);
    }
  }
  return missed;
}

function boundOf(coverage: AutopilotCoverage): Date | null {
  const first = coverage.attemptedClosures.reduce<Date | null>(
    (earliest, closure) => (earliest === null || closure < earliest ? closure : earliest),
    null,
  );
  if (first === null) {
    return null;
  }
  const candidates = [first, coverage.floorAt, coverage.lastLiveBatchClosesAt].filter(
    (date): date is Date => date !== null,
  );
  return new Date(Math.max(...candidates.map((date) => date.getTime())));
}

/**
 * Le message rangé avec la tentative `missed` : il nomme les clôtures et le
 * geste de sortie, lu par la comptabilité sans le code sous les yeux.
 */
export function missedClosuresMessage(missed: readonly Date[]): string {
  const days = missed.map(parisLongDay);
  const named =
    days.length === 1
      ? `la période close le ${days.join("")} n'a jamais été préparée`
      : `les périodes closes le ${days.join(", le ")} n'ont jamais été préparées`;
  return `Lot non préparé automatiquement : ${named} (passage de l'automatisme manqué). Préparez le lot à la main (« Préparer le lot ») : il reprend les commandes de ces périodes, et l'automatisme reprendra au cycle suivant.`;
}
