import { HttpErrorResponse } from '@angular/common/http';
import { declareExperimentalWebMcpTool, inject } from '@angular/core';

import { ProductHttpApi } from '../pim/catalogue/product-http-api';
import type { Product } from '../pim/data/models';
import { serverMessageOf } from '../production/server-message';
import { said } from './agent-tool-text';

/** Une fiche que la boucle a tenté de publier. */
type Candidate = Pick<Product, 'id' | 'sku' | 'name'>;

/** Ce que la boucle a fait, fiche par fiche. */
export interface PublishReport {
  readonly published: number;
  readonly refused: readonly { readonly product: Candidate; readonly message: string }[];
  /** Le motif qui a ARRÊTÉ la boucle (429, serveur muet), `null` si elle est allée au bout. */
  readonly stoppedBy: string | null;
  readonly untried: number;
}

/**
 * Un 429 ou un statut 0 : continuer aggraverait le blocage de la passerelle,
 * qui a tenu toute la session une minute le 2026-10-26.
 */
function stopsTheLoop(caught: unknown): boolean {
  return caught instanceof HttpErrorResponse && (caught.status === 429 || caught.status === 0);
}

function messageOf(caught: unknown): string {
  if (caught instanceof HttpErrorResponse) {
    return serverMessageOf(caught);
  }
  return caught instanceof Error ? caught.message : String(caught);
}

/**
 * Publie les fiches **une à une, en série** : un refus métier (409) est noté
 * et la boucle continue ; un 429 ou un serveur muet l'arrête.
 */
export async function publishInSeries(
  candidates: readonly Candidate[],
  publish: (id: string) => Promise<void>,
): Promise<PublishReport> {
  let published = 0;
  const refused: { product: Candidate; message: string }[] = [];
  for (const [index, product] of candidates.entries()) {
    try {
      await publish(product.id);
      published += 1;
    } catch (caught) {
      if (stopsTheLoop(caught)) {
        const status = caught instanceof HttpErrorResponse ? caught.status : 0;
        return {
          published,
          refused,
          stoppedBy: `${status} — ${messageOf(caught)}`,
          untried: candidates.length - index,
        };
      }
      refused.push({ product, message: messageOf(caught) });
    }
  }
  return { published, refused, stoppedBy: null, untried: 0 };
}

function reportText(report: PublishReport): string {
  const lines = [`${report.published} fiche(s) publiée(s), ${report.refused.length} refus.`];
  for (const row of report.refused) {
    lines.push(
      `  refus : ${row.product.sku} — ${row.product.name.fr ?? '(sans nom fr)'} — ${row.message}`,
    );
  }
  if (report.stoppedBy !== null) {
    lines.push(
      `ARRÊT : ${report.stoppedBy}. ${report.untried} fiche(s) non tentée(s) — relancer plus tard.`,
    );
  }
  return lines.join('\n');
}

/** Déclare `pim_products_publish_ready` et rend son nom. */
export function declarePimPublishReadyAgentTool(): string {
  const products = inject(ProductHttpApi);
  void declareExperimentalWebMcpTool({
    name: 'pim_products_publish_ready',
    description:
      'Tente de publier chaque fiche en brouillon (ou les productIds donnés), une par une, jamais en parallèle. Rend le nombre publié et, pour chaque refus, la fiche et le message du serveur tel quel. Un refus métier n’arrête pas la boucle ; un 429 ou un serveur muet l’arrête, et le bilan le dit.',
    inputSchema: {
      type: 'object',
      properties: { productIds: { type: 'array', items: { type: 'string' } } },
      additionalProperties: false,
    },
    execute: (args) =>
      said('Publication en série', async () => {
        const rows = await products.list();
        const wanted = args.productIds;
        const candidates =
          wanted === undefined
            ? rows.filter((row) => row.status === 'draft')
            : wanted.map(
                (id): Candidate =>
                  rows.find((row) => row.id === id) ?? { id, sku: id, name: { fr: '(inconnue)' } },
              );
        if (candidates.length === 0) {
          return 'Aucune fiche à publier.';
        }
        return reportText(await publishInSeries(candidates, (id) => products.publish(id)));
      }),
  });
  return 'pim_products_publish_ready';
}
