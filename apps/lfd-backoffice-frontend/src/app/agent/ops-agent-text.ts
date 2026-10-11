import type {
  CapabilitiesReport,
  EcosystemHealth,
  HealthStatus,
  MediaThresholdsReport,
  NodeHealth,
  TrafficReport,
  TrafficWindow,
} from '@lfd/ops-contract';
import { errorRate } from '@lfd/ops-contract';
import type { DeadLettersView } from '@lfd/contracts';

import { REASON_LABEL } from '../ops/reason-label';

/**
 * Le rang d'un statut dans la lecture : le rouge d'abord, puis l'orange, puis
 * l'angle mort, le vert en dernier — un agent lit de haut en bas et s'arrête
 * tôt, comme un humain devant la carte.
 */
const STATUS_RANK: Readonly<Record<HealthStatus, number>> = {
  down: 0,
  degraded: 1,
  unknown: 2,
  up: 3,
};

/** Combien de surfaces par nœud : les plus appelées, pas un inventaire. */
const TOP_SURFACES = 5;

function percent(rate: number): string {
  return `${(rate * 100).toFixed(1)} %`;
}

function nodeLine(node: NodeHealth): string {
  const detail = [
    node.dependencyDown === undefined ? null : `dépend de ${node.dependencyDown}, en panne`,
    node.lastError === undefined
      ? null
      : `dernière erreur ${node.lastError.at} : ${node.lastError.message}`,
    ...node.readings.map((reading) => `${reading.label} ${reading.value}${reading.unit ?? ''}`),
  ].filter((part): part is string => part !== null);
  return [
    `${node.status.toUpperCase()} — ${node.label} (${node.node}) — ${REASON_LABEL[node.reason]} — depuis ${node.since}`,
    ...detail.map((part) => `  · ${part}`),
  ].join('\n');
}

/** La carte de santé en texte, les briques en panne en tête. */
export function healthText(health: EcosystemHealth): string {
  const nodes = [...health.nodes].sort(
    (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.label.localeCompare(b.label),
  );
  const failing = nodes.filter((node) => node.status === 'down' || node.status === 'degraded');
  return [
    `Carte du ${health.generatedAt} — ${nodes.length} brique(s), ${failing.length} en panne ou dégradée(s).`,
    ...nodes.map(nodeLine),
  ].join('\n');
}

function windowText(window: TrafficWindow): string {
  const surfaces = [...(window.surfaces ?? [])]
    .sort((a, b) => b.requests - a.requests)
    .slice(0, TOP_SURFACES)
    .map(
      (surface) =>
        `  · ${surface.surface} — ${surface.requests} req., ${percent(errorRate(surface))} erreurs serveur, p95 ${surface.p95Ms} ms`,
    );
  return [
    `${window.node} — ${window.requests} requête(s), ${percent(errorRate(window))} erreurs serveur, p95 ${window.p95Ms} ms, ${window.throttled} rejet(s) du limiteur (429), ${window.gatewayFaults} sans réponse amont`,
    ...surfaces,
  ].join('\n');
}

/**
 * Le trafic en texte. La provenance vient en PREMIÈRE ligne : une répétition
 * lue comme la production est la panne d'observabilité que le contrat nomme.
 */
export function trafficText(report: TrafficReport, minutes: number): string {
  const source =
    report.source === 'rehearsal'
      ? 'RÉPÉTITION — Analytics Engine n’est pas configuré, ces chiffres sont fabriqués.'
      : 'Source : Analytics Engine.';
  return [
    `Trafic des ${minutes} dernière(s) minute(s), au ${report.generatedAt}. ${source}`,
    ...(report.windows.length === 0 ? ['Aucune fenêtre rendue.'] : report.windows.map(windowText)),
  ].join('\n');
}

/** Les capacités éteintes, bloquantes d'abord, avec le NOM de la variable — jamais sa valeur. */
export function capabilitiesText(report: CapabilitiesReport): string {
  if (report.missing.length === 0) {
    return `Révision ${report.revision} — aucune capacité éteinte.`;
  }
  const missing = [...report.missing].sort(
    (a, b) => Number(a.severity !== 'blocking') - Number(b.severity !== 'blocking'),
  );
  return [
    `Révision ${report.revision} — ${missing.length} capacité(s) éteinte(s).`,
    ...missing.map(
      (item) =>
        `${item.severity === 'blocking' ? 'BLOQUANT' : 'DÉGRADÉ'} — ${item.capability} — variable ${item.setting} — ${item.consequence}`,
    ),
  ].join('\n');
}

/** Les seuils de la médiathèque, dépassés d'abord. */
export function mediaThresholdsText(report: MediaThresholdsReport): string {
  const rank = { exceeded: 0, attention: 1, ok: 2 } as const;
  const thresholds = [...report.thresholds].sort((a, b) => rank[a.state] - rank[b.state]);
  return [
    `Fonds de ${report.images} image(s), au ${report.generatedAt}.`,
    ...thresholds.map(
      (item) =>
        `${item.state.toUpperCase()} — ${item.label} — ${item.estimated ? '≈ ' : ''}${item.measured} / ${item.limit} ${item.unit} — ${item.message} (source : ${item.source})`,
    ),
  ].join('\n');
}

/** Les messages morts — le couple message × abonné, et la dernière erreur. */
export function deadLettersText(view: DeadLettersView): string {
  if (view.letters.length === 0) {
    return 'Aucun message mort : tout fait durable a été livré à ses abonnés.';
  }
  return [
    `${view.letters.length} message(s) mort(s)${view.truncated ? ' — liste COUPÉE, il en reste d’autres' : ''}.`,
    ...view.letters.map(
      (letter) =>
        `${letter.type} → ${letter.subscriber} — ${letter.attempts} essai(s) — ${letter.occurredAt} — clé ${letter.key} — ${letter.lastError ?? '(pas d’erreur rapportée)'}`,
    ),
  ].join('\n');
}
