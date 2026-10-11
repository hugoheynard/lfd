import { declareExperimentalWebMcpTool, inject } from '@angular/core';

import { OpsService } from '../ops/ops.service';

import { said } from './agent-tool-text';
import {
  capabilitiesText,
  deadLettersText,
  healthText,
  mediaThresholdsText,
  trafficText,
} from './ops-agent-text';

/**
 * Bornes de la fenêtre de trafic, celles que le serveur applique
 * (`resolveWindowMinutes`, `apps/lfd-api/src/ops/traffic/traffic-query.ts` :
 * 1 à 1 440 minutes — lu le 2026-10-11). Bornée ICI aussi pour que le texte
 * rendu dise la fenêtre réellement lue, pas celle que l'agent a demandée.
 */
const MIN_TRAFFIC_MINUTES = 1;
const MAX_TRAFFIC_MINUTES = 24 * 60;
/** Le défaut de l'écran de santé : cinq minutes = « en ce moment ». */
const DEFAULT_TRAFFIC_MINUTES = 5;

/** Les noms de la trousse, dans l'ordre où la page les affiche. */
export const OPS_AGENT_TOOLS = [
  'ops_health',
  'ops_traffic',
  'ops_capabilities',
  'ops_media_thresholds',
  'ops_dead_letters',
] as const;

function trafficMinutes(asked: number | undefined): number {
  if (asked === undefined || !Number.isFinite(asked)) {
    return DEFAULT_TRAFFIC_MINUTES;
  }
  return Math.min(MAX_TRAFFIC_MINUTES, Math.max(MIN_TRAFFIC_MINUTES, Math.round(asked)));
}

const NO_INPUT = { type: 'object', properties: {}, additionalProperties: false } as const;

/**
 * **Les outils WebMCP de l'exploitation** — ce que la carte de santé
 * (`/sante`) montre, rendu en texte pour un agent qui diagnostique.
 *
 * Chaque outil vise une route `GET` par {@link OpsService}, le client de
 * l'écran : même mur (`@AdminSurface("ops_health")`), même session.
 *
 * 🔴 **Aucun outil n'écrit**, et c'est délibéré :
 * - **rejouer un message mort** (`POST /admin/outbox/replay`) relance un
 *   abonné qui a échoué jusqu'au bout — un e-mail renvoyé, un état recalculé
 *   chez un autre bloc. Décider que la cause est levée est un jugement
 *   humain ; un agent qui rejoue en boucle multiplie l'effet qu'on cherche à
 *   comprendre ;
 * - **recalculer** une carte, un seuil ou une fenêtre n'existe pas côté
 *   serveur : OPS observe, il n'agit pas (design §2), et la trousse ne lui
 *   prête pas un geste qu'il n'a pas.
 *
 * Un refus (403, 5xx) rend un texte lisible par {@link said}, jamais une
 * exception qui casserait la boucle de l'agent.
 */
export function declareOpsAgentTools(): readonly string[] {
  const ops = inject(OpsService);

  void declareExperimentalWebMcpTool({
    name: 'ops_health',
    description:
      'La carte de santé : chaque brique (nœud), son statut (DOWN, DEGRADED, UNKNOWN, UP), la raison en français, depuis quand, et son détail (dépendance en panne, dernière erreur, relevés). Les rouges et orange d’abord. Lecture seule.',
    inputSchema: NO_INPUT,
    execute: () => said('Lecture de la carte de santé', async () => healthText(await ops.health())),
  });

  void declareExperimentalWebMcpTool({
    name: 'ops_traffic',
    description:
      'Ce que la passerelle a vu passer sur les `minutes` dernières minutes (1 à 1440, 5 par défaut) : par nœud, requêtes, part d’erreurs serveur, p95, rejets du limiteur (429), et les surfaces les plus appelées. La première ligne dit si les chiffres sont une RÉPÉTITION. Lecture seule.',
    inputSchema: {
      type: 'object',
      properties: { minutes: { type: 'number' } },
      additionalProperties: false,
    },
    execute: (args) =>
      said('Lecture du trafic', async () => {
        const minutes = trafficMinutes(args.minutes);
        return trafficText(await ops.traffic(minutes), minutes);
      }),
  });

  void declareExperimentalWebMcpTool({
    name: 'ops_capabilities',
    description:
      'Les capacités éteintes de l’instance en service : bloquantes d’abord, puis dégradées, avec leur conséquence et le NOM de la variable à régler (jamais sa valeur). Lecture seule.',
    inputSchema: NO_INPUT,
    execute: () =>
      said('Lecture des capacités', async () => capabilitiesText(await ops.capabilities())),
  });

  void declareExperimentalWebMcpTool({
    name: 'ops_media_thresholds',
    description:
      'Le fonds de la médiathèque face à ses limites connues (tri classé, frise des couleurs, transformations Cloudflare) : mesuré, limite, état (EXCEEDED, ATTENTION, OK), message. Dépassés d’abord. Lecture seule.',
    inputSchema: NO_INPUT,
    execute: () =>
      said('Lecture des seuils de la médiathèque', async () =>
        mediaThresholdsText(await ops.mediaThresholds()),
      ),
  });

  void declareExperimentalWebMcpTool({
    name: 'ops_dead_letters',
    description:
      'Les messages durables non livrés : fait, abonné qui bloque, essais, date, clé, dernière erreur ; les plus récents d’abord, bornés. Lecture seule — le rejeu reste un geste humain, à l’écran de santé.',
    inputSchema: NO_INPUT,
    execute: () =>
      said('Lecture des messages morts', async () => deadLettersText(await ops.deadLetters())),
  });

  return OPS_AGENT_TOOLS;
}
