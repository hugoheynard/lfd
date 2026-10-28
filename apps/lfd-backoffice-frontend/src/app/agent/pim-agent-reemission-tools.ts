import { declareExperimentalWebMcpTool, inject } from '@angular/core';
import type { CatalogReemissionView } from '@lfd/pim-contracts';

import { ReemissionHttpApi } from '../pim/catalogue-overview/reemission/reemission-http-api';

import { said } from './agent-tool-text';

/** Le compte rendu d'un travail, une donnée par ligne — lisible sans le code. */
export function reemissionReport(job: CatalogReemissionView): string {
  const lines = [
    `id        : ${job.id}`,
    `portée    : ${job.scope === 'all' ? 'tout le catalogue' : `fiche ${job.productId ?? '?'}`}`,
    `état      : ${job.status}`,
    `lancée    : ${job.startedAt}${job.startedByName === null ? '' : ` par ${job.startedByName}`}`,
    `finie     : ${job.finishedAt ?? '(en cours)'}`,
    `tentées   : ${job.productsAttempted}`,
    `réussies  : ${job.productsSucceeded}`,
  ];
  if (job.error !== null) {
    lines.push(`arrêt     : ${job.error}`);
  }
  for (const failure of job.failures) {
    lines.push(
      `échec     : ${failure.productId} — ${failure.name ?? '(nom illisible)'} — ${failure.reason}`,
    );
  }
  return lines.join('\n');
}

/**
 * **La réémission du catalogue, pour un agent** (2026-10-18) — le filet des
 * faits vers la boutique B2B, devenu un travail suivi.
 *
 * Déclarés seulement avec `pim_channels:write`, le droit que `POST
 * /pim/channels/b2b/reemit` oppose — la lecture du compte rendu, sous
 * `pim_channels:read`, va avec : un agent qui lance doit pouvoir relire.
 */
export function declarePimReemissionAgentTools(): readonly string[] {
  const api = inject(ReemissionHttpApi);

  void declareExperimentalWebMcpTool({
    name: 'pim_catalog_reemit',
    description:
      "Réémet vers la boutique B2B : une fiche (productId), ou tout le catalogue (familles, fiches, puis règles) sans productId. Rend l'identifiant du travail tout de suite ; le travail tourne en arrière-plan (environ une minute pour tout). Un second « tout » est refusé tant qu'un premier tourne. Lire ensuite pim_catalog_reemission_status jusqu'à done ou failed.",
    inputSchema: {
      type: 'object',
      properties: { productId: { type: 'string' } },
      additionalProperties: false,
    },
    execute: (args) =>
      said('Réémission', async () => {
        const id = await api.start(args.productId ?? null);
        return `Réémission lancée : ${id}. Relire pim_catalog_reemission_status avec ce jobId.`;
      }),
  });

  void declareExperimentalWebMcpTool({
    name: 'pim_catalog_reemission_status',
    description:
      "Lit le compte rendu d'une réémission : état (running, done, failed), fiches tentées et réussies, fiches en échec nommées avec leur raison, et ce qui a tout arrêté. Avec jobId : ce travail ; sans : la dernière réémission. Lecture seule.",
    inputSchema: {
      type: 'object',
      properties: { jobId: { type: 'string' } },
      additionalProperties: false,
    },
    execute: (args) =>
      said('Lecture de la réémission', async () => {
        const job = args.jobId === undefined ? await api.latest() : await api.byId(args.jobId);
        return job === null ? "Aucune réémission n'a encore été lancée." : reemissionReport(job);
      }),
  });

  return ['pim_catalog_reemit', 'pim_catalog_reemission_status'];
}
