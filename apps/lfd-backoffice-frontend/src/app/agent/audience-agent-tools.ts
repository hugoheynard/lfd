import { declareExperimentalWebMcpTool, inject } from '@angular/core';
import {
  AUDIENCE_DIMENSIONS,
  AUDIENCE_PERIODS,
  DEFAULT_AUDIENCE_PERIOD,
  type AudienceCell,
  type AudienceDimension,
  type AudiencePeriod,
  type AudiencesView,
} from '@lfd/contracts';

import {
  anonymityHelp,
  audienceRowOf,
  DIMENSION_TEXTS,
} from '../analytics/audiences/audience-format';
import { AudiencesService } from '../analytics/audiences/audiences.service';

import { said } from './agent-tool-text';

/** La trousse des audiences — déclarée avec `b2b_growth:read`. Elle ne fait que lire. */
export const AUDIENCE_TOOLS = ['audiences_read'] as const;

/**
 * **Les outils WebMCP des audiences** (2026-10-18, lots A1 et A3 de
 * `plan-audiences.md`) — Analytics › Audiences, sans le clic. Même route que
 * l'écran (`GET admin/audiences`, sous `b2b_growth:read`), donc le même seuil
 * d'anonymat, appliqué par le serveur : une case masquée n'arrive jamais avec
 * ses chiffres, et l'outil ne peut pas en dire plus que l'écran.
 */
export function declareAudienceAgentTools(): readonly string[] {
  const api = inject(AudiencesService);

  void declareExperimentalWebMcpTool({
    name: 'audiences_read',
    description:
      'Les audiences de la clientèle, comme l’écran Analytics › Audiences : sur `days` jours (7, 30 ou 90 ; 30 par défaut, aujourd’hui compris), pour chaque coupe (`dimension` : clientele = pros ou particuliers, activity = activité du pro d’après son code NAF, fulfillment = retrait ou livraison, pickup_site = point de retrait, delivery_zone = code postal livré, loyalty = nombre de commandes d’un même client, moment = jour et tranche horaire à Paris, order_locale = langue de la boutique à la commande (fr, en, it, ou non renseignée), stay_profile = profil de séjour ESTIMÉ des particuliers (résident, saisonnier, vacancier, indéterminé — une estimation d’après la langue, l’indicatif téléphonique et le rythme des commandes, jamais une déclaration) ; toutes si omise), une ligne par case : clients distincts, commandes, panier moyen HT et TTC, chiffre d’affaires HT et TTC, familles en tête. Une case sous le seuil d’anonymat ne porte AUCUN chiffre (« trop peu de clients »). Aucun client n’est nommé. Lecture seule.',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'integer', enum: AUDIENCE_PERIODS },
        dimension: { type: 'string', enum: AUDIENCE_DIMENSIONS },
      },
      additionalProperties: false,
    },
    execute: (args: {
      readonly days?: AudiencePeriod | undefined;
      readonly dimension?: AudienceDimension | undefined;
    }) =>
      said('Lecture des audiences', async () =>
        audiencesText(await api.read(args.days ?? DEFAULT_AUDIENCE_PERIOD, args.dimension)),
      ),
  });

  return AUDIENCE_TOOLS;
}

/** Une case en une ligne : ses chiffres, ou le seuil. */
function cellText(cell: AudienceCell): string {
  const row = audienceRowOf(cell);
  if (row.masked) {
    return `- ${row.label} [${row.key}] : trop peu de clients`;
  }
  return `- ${row.label} [${row.key}] : ${row.clients} clients · ${row.orders} commandes · panier moyen ${row.averageBasket} · CA ${row.revenue} · familles en tête ${row.topFamilies}`;
}

/** Les audiences en texte : la période et la règle, puis chaque coupe et les abonnements. */
export function audiencesText(view: AudiencesView): string {
  const blocks = view.segmentations.map((segmentation) =>
    [
      `${DIMENSION_TEXTS[segmentation.dimension].title} (${segmentation.dimension})`,
      ...(segmentation.cells.length === 0
        ? ['- aucune commande dans cette coupe']
        : segmentation.cells.map(cellText)),
    ].join('\n'),
  );
  return [
    `Du ${view.from} au ${view.to} (${String(view.days)} jours). ${anonymityHelp(view.minClients)}`,
    ...blocks,
    `Abonnements, à part\n${cellText(view.subscriptions)}`,
  ].join('\n\n');
}
