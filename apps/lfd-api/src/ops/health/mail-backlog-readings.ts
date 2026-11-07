import type { NodeReading } from "@lfd/ops-contract";

import type { MailBacklogFigures } from "./mail-backlog-readings.port.js";

/**
 * **La veille du courrier différé, en relevés** — pur, donc testable.
 *
 * Les rebonds disent si nos e-mails ARRIVENT ; ces deux-là disent s'ils
 * PARTENT. Toujours affichés, zéro compris : contrairement au volume d'envoi,
 * « 0 en attente » est une mesure, pas un silence — la file est vide.
 */
export function mailBacklogReadings(figures: MailBacklogFigures): readonly NodeReading[] {
  return [
    {
      label: "En attente",
      value: figures.stalled,
      hint: stalledHint(figures),
    },
    {
      label: "Échecs définitifs",
      value: figures.definitiveFailures,
      hint:
        figures.definitiveFailures === 0
          ? "Sur 24 h. Aucun e-mail abandonné."
          : "Sur 24 h. Ils ne repartiront pas seuls : un humain décide de les renvoyer.",
    },
  ];
}

function stalledHint(figures: MailBacklogFigures): string {
  const threshold = `Demandés depuis plus de ${figures.stalledAfterMinutes} min, pas encore partis.`;
  if (figures.oldestStalledMinutes === null) {
    return `${threshold} Aucun — la boîte d'envoi part.`;
  }
  return `⚠ ${threshold} Le plus ancien attend depuis ${figures.oldestStalledMinutes} min : la boîte d'envoi ne part plus.`;
}
