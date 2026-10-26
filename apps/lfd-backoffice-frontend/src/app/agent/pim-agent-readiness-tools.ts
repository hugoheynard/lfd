import { declareExperimentalWebMcpTool, inject } from '@angular/core';

import { CategoryHttpApi } from '../pim/catalogue/category-http-api';
import { type ProductDetail, ProductHttpApi } from '../pim/catalogue/product-http-api';
import type { Category, Variant } from '../pim/data/models';

import { isPublishedMediaRole } from '../pim/catalogue/media-roles';
import { said } from './agent-tool-text';
import { mapWithConcurrency } from './bounded-pool';
import { declarePimPublishReadyAgentTool } from './pim-agent-publish-ready-tool';

/**
 * Lectures de détail en vol à la fois. La ligne de liste ne porte ni les
 * déclinaisons, ni les visuels, ni même la signature `readiness` (qui n'est de
 * toute façon pas un verdict) : le détail reste nécessaire, mais borné.
 */
const DETAIL_READS_IN_FLIGHT = 4;

/** Les contextes dont la TVA effective conditionne la vente (consigne du 2026-10-17). */
const REQUIRED_VAT_CONTEXTS: readonly { readonly key: string; readonly label: string }[] = [
  { key: 'takeaway', label: 'à emporter' },
  { key: 'b2b', label: 'B2B' },
];

/**
 * Ce qui manque à une fiche pour être vendable, un manque par ligne.
 *
 * La déclinaison qui suit le défaut est lue SUR le défaut, drapeau par drapeau
 * (`regulatoryFollowsDefault` pour les allergènes, `pricingFollowsDefault` pour
 * le tarif). Le serveur sert déjà des valeurs résolues ; refaire la résolution
 * ici garde le diagnostic juste même si la vue cessait de l'être.
 * La TVA effective est la dérogation de la fiche par-dessus sa famille
 * (`effectiveVat`, `context-vat.ts`, lu le 2026-10-17).
 */
export function missingForSale(
  detail: ProductDetail,
  family: Pick<Category, 'vatByContext'> | undefined,
): string[] {
  const missing: string[] = [];
  const variants = detail.product.variants.filter((v) => !v.isDiscontinued);
  const fallback = detail.product.variants.find((v) => v.isDefault);
  const from = (variant: Variant, follows: boolean): Variant =>
    follows && fallback !== undefined ? fallback : variant;
  for (const variant of variants) {
    const priced = from(variant, variant.pricingFollowsDefault);
    const regulatory = from(variant, variant.regulatoryFollowsDefault);
    if (priced.priceCents === null) {
      missing.push(`déclinaison ${variant.sku} : prix public absent`);
    }
    if (priced.proPriceMillicents === null) {
      missing.push(`déclinaison ${variant.sku} : prix pro absent`);
    }
    if (regulatory.allergens === null) {
      missing.push(`déclinaison ${variant.sku} : allergènes non déclarés`);
    }
  }
  if (variants.length === 0) {
    missing.push('aucune déclinaison active');
  }
  const vat = { ...(family?.vatByContext ?? {}), ...detail.product.vatByContext };
  for (const context of REQUIRED_VAT_CONTEXTS) {
    if (vat[context.key] === undefined) {
      missing.push(`TVA ${context.label} non réglée (ni sur la fiche, ni sur sa famille)`);
    }
  }
  // Une photo rangée seulement en galerie ne paraît nulle part : seuls les
  // usages publiés (ouverture, vignette) comptent.
  if (!detail.media.some((slot) => slot.role !== undefined && isPublishedMediaRole(slot.role))) {
    missing.push('aucune photo en ouverture ni en vignette');
  }
  return missing;
}

function verdict(detail: ProductDetail, families: readonly Category[]): string {
  const family = families.find((row) => row.id === detail.product.categoryId);
  const missing = missingForSale(detail, family);
  const head = `${detail.product.id} — ${detail.product.sku} — ${detail.product.name.fr ?? '(sans nom fr)'} — ${detail.product.status}`;
  return missing.length === 0
    ? `${head}\n  vendable : rien ne manque`
    : `${head}\n${missing.map((line) => `  manque : ${line}`).join('\n')}`;
}

export function declarePimReadinessAgentTools(): readonly string[] {
  const products = inject(ProductHttpApi);
  const categories = inject(CategoryHttpApi);

  void declareExperimentalWebMcpTool({
    name: 'pim_product_readiness',
    description:
      "Dit ce qui manque pour qu'une fiche soit vendable : prix public, prix pro, TVA effective à emporter et B2B (fiche par-dessus famille), allergènes déclarés, au moins une photo en ouverture ou en vignette (la galerie ne paraît nulle part). Avec productId : cette fiche ; sans : toutes les fiches non archivées, ou celles du status donné (draft | published), lues quatre à la fois. Lecture seule. À appeler avant pim_product_publish.",
    inputSchema: {
      type: 'object',
      properties: {
        productId: { type: 'string' },
        status: { type: 'string', enum: ['draft', 'published'] },
      },
      additionalProperties: false,
    },
    execute: (args) =>
      said('Lecture de la vendabilité', async () => {
        const families = await categories.list();
        if (args.productId !== undefined) {
          const detail = await products.getDetail(args.productId);
          return detail === null
            ? `Aucune fiche pour l'identifiant ${args.productId}.`
            : verdict(detail, families);
        }
        const rows = (await products.list()).filter((row) =>
          args.status === undefined ? row.status !== 'archived' : row.status === args.status,
        );
        const details = await mapWithConcurrency(rows, DETAIL_READS_IN_FLIGHT, (row) =>
          products.getDetail(row.id),
        );
        const lines = details
          .filter((detail) => detail !== null)
          .map((detail) => verdict(detail, families));
        return lines.length === 0 ? 'Aucune fiche.' : lines.join('\n');
      }),
  });

  void declareExperimentalWebMcpTool({
    name: 'pim_product_publish',
    description:
      'Met une fiche en vente. Le serveur refuse si une déclinaison active n’a pas de fiche réglementaire, et le refus est rendu tel quel. Vérifier d’abord avec pim_product_readiness.',
    inputSchema: {
      type: 'object',
      properties: { productId: { type: 'string' } },
      required: ['productId'],
      additionalProperties: false,
    },
    execute: (args) =>
      said('Publication', async () => {
        await products.publish(args.productId);
        return `Fiche ${args.productId} publiée.`;
      }),
  });

  void declareExperimentalWebMcpTool({
    name: 'pim_product_unpublish',
    description:
      'Retire une fiche de la vente : elle redevient brouillon, elle n’est pas archivée.',
    inputSchema: {
      type: 'object',
      properties: { productId: { type: 'string' } },
      required: ['productId'],
      additionalProperties: false,
    },
    execute: (args) =>
      said('Retrait de la vente', async () => {
        await products.unpublish(args.productId);
        return `Fiche ${args.productId} retirée de la vente (brouillon).`;
      }),
  });

  return [
    'pim_product_readiness',
    'pim_product_publish',
    declarePimPublishReadyAgentTool(),
    'pim_product_unpublish',
  ];
}
