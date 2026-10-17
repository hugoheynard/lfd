import { declareExperimentalWebMcpTool, inject } from '@angular/core';

import { CategoryHttpApi } from '../pim/catalogue/category-http-api';
import { type MediaSlot, ProductHttpApi } from '../pim/catalogue/product-http-api';
import { VatRateHttpApi } from '../pim/catalogue/vat-rates/vat-http-api';

import { said } from './agent-tool-text';

/**
 * **Ce qui rend une fiche vendable** — prix, TVA, visuels, côté outils agent.
 *
 * Même parti que `pim-agent-tools.ts` : chaque outil vise une route HTTP
 * existante par les clients de l'écran (`ProductHttpApi`, `CategoryHttpApi`,
 * `VatRateHttpApi`), donc les validations du serveur s'appliquent telles
 * quelles. Décision de Hugo du 2026-10-17 : aucune route nouvelle.
 */

/** Les trois contextes de vente qu'un outil sait viser (consigne du 2026-10-17). */
const VAT_CONTEXTS = ['takeaway', 'eatIn', 'b2b'] as const;

/** Les usages dont la fiche ne porte qu'UN visuel. */
const SINGLE_ROLES: readonly string[] = ['hero', 'thumbnail'];

/**
 * Fusionne une saisie de TVA dans la carte actuelle : absent = gardé, `''` =
 * retiré (« non réglé » sur une famille, « suit sa famille » sur une fiche).
 */
export function mergedVat(
  current: Readonly<Record<string, string>>,
  given: Partial<Record<(typeof VAT_CONTEXTS)[number], string>>,
): Record<string, string> {
  const next: Record<string, string> = { ...current };
  for (const key of VAT_CONTEXTS) {
    const value = given[key];
    if (value === undefined) {
      continue;
    }
    if (value === '') {
      Reflect.deleteProperty(next, key);
    } else {
      next[key] = value;
    }
  }
  return next;
}

/** Le premier usage unique porté deux fois, ou `null`. */
function duplicatedSingleRole(media: readonly { role: string }[]): string | null {
  for (const role of SINGLE_ROLES) {
    if (media.filter((slot) => slot.role === role).length > 1) {
      return role;
    }
  }
  return null;
}

export function declarePimCommerceAgentTools(): readonly string[] {
  const products = inject(ProductHttpApi);
  const categories = inject(CategoryHttpApi);
  const rates = inject(VatRateHttpApi);

  void declareExperimentalWebMcpTool({
    name: 'pim_variant_set_pricing',
    description:
      'Pose le tarif d\'une déclinaison : prix public TTC en centimes (priceCents), poids en grammes (weightGrams), prix pro HORS TAXE en euros sous forme de TEXTE (proPriceHt, ex. "12.34", cinq décimales au plus ; "" l\'efface). Un champ omis GARDE sa valeur actuelle. `variantId` vient de pim_product_read. REFUSE une déclinaison qui suit le tarif du défaut : viser la déclinaison par défaut.',
    inputSchema: {
      type: 'object',
      properties: {
        productId: { type: 'string' },
        variantId: { type: 'string' },
        priceCents: { type: 'integer' },
        weightGrams: { type: 'integer' },
        proPriceHt: { type: 'string' },
      },
      required: ['productId', 'variantId'],
      additionalProperties: false,
    },
    execute: (args) =>
      said('Écriture du tarif', async () => {
        const detail = await products.getDetail(args.productId);
        if (detail === null) {
          return `Aucune fiche pour l'identifiant ${args.productId}.`;
        }
        const target = detail.product.variants.find((row) => row.id === args.variantId);
        if (target === undefined) {
          return `La déclinaison ${args.variantId} n'appartient pas à cette fiche.`;
        }
        // Le tarif servi est RÉSOLU (`product.ts`, `resolvedSnapshot`, lu le
        // 2026-10-17) : sur une déclinaison alignée, il est celui du défaut, et
        // le reporter le graverait sur elle — le piège de la nutrition.
        if (target.pricingFollowsDefault) {
          return (
            `La déclinaison ${args.variantId} suit le tarif de celle par défaut : ` +
            `ce qu'elle affiche appartient au défaut. Poser le tarif sur la déclinaison PAR DÉFAUT, ` +
            `ou décocher « suit le tarif du défaut » dans la section Tarif de l'écran de la fiche.`
          );
        }
        // `proPriceHt` absent = inchangé côté serveur : on ne l'envoie que s'il est donné.
        const proPrice =
          args.proPriceHt === undefined
            ? {}
            : { proPriceHt: args.proPriceHt.trim() === '' ? null : args.proPriceHt.trim() };
        await products.savePricing(args.productId, args.variantId, {
          priceCents: args.priceCents ?? target.priceCents,
          weightGrams: args.weightGrams ?? target.weightGrams,
          ...proPrice,
        });
        return `Tarif écrit sur ${args.variantId}.`;
      }),
  });

  void declareExperimentalWebMcpTool({
    name: 'pim_vat_rates_list',
    description:
      'Liste les taux de TVA du référentiel : identifiant, nom, pourcentage. À appeler AVANT pim_set_vat, qui attend des identifiants de taux.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    execute: () =>
      said('Lecture des taux', async () => {
        const rows = await rates.list();
        return rows.length === 0
          ? 'Aucun taux.'
          : rows.map((rate) => `${rate.id} — ${rate.name} — ${String(rate.percent)} %`).join('\n');
      }),
  });

  void declareExperimentalWebMcpTool({
    name: 'pim_set_vat',
    description:
      'Règle la TVA par contexte de vente (takeaway = à emporter, eatIn = sur place, b2b = pro) sur une FAMILLE (target "category") ou une FICHE (target "product", une dérogation à sa famille). Chaque valeur est un identifiant de pim_vat_rates_list. Un contexte omis GARDE sa valeur ; "" le retire (sur une fiche, elle suit alors sa famille). Le serveur refuse un taux inconnu.',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', enum: ['category', 'product'] },
        id: { type: 'string' },
        takeaway: { type: 'string' },
        eatIn: { type: 'string' },
        b2b: { type: 'string' },
      },
      required: ['target', 'id'],
      additionalProperties: false,
    },
    execute: (args) =>
      said('Écriture de la TVA', async () => {
        const given = {
          ...(args.takeaway === undefined ? {} : { takeaway: args.takeaway }),
          ...(args.eatIn === undefined ? {} : { eatIn: args.eatIn }),
          ...(args.b2b === undefined ? {} : { b2b: args.b2b }),
        };
        if (args.target === 'category') {
          const family = await categories.detail(args.id);
          await categories.setVat(args.id, mergedVat(family.vatByContext, given));
          return `TVA écrite sur la famille ${args.id}.`;
        }
        const detail = await products.getDetail(args.id);
        if (detail === null) {
          return `Aucune fiche pour l'identifiant ${args.id}.`;
        }
        await products.saveVat(args.id, mergedVat(detail.product.vatByContext, given));
        return `TVA écrite sur la fiche ${args.id}.`;
      }),
  });

  void declareExperimentalWebMcpTool({
    name: 'pim_product_set_media',
    description:
      "Remplace les visuels d'une fiche : la liste ENTIÈRE, dans son ordre — un visuel absent est détaché. Chaque entrée {role, url, name} ; rôles : hero, thumbnail (les deux seuls que la boutique publie), gallery, lifestyle, print. Une même url peut porter plusieurs rôles (une entrée par rôle). Un seul hero et un seul thumbnail par fiche. Lire d'abord avec pim_product_read.",
    inputSchema: {
      type: 'object',
      properties: {
        productId: { type: 'string' },
        media: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              role: {
                type: 'string',
                enum: ['hero', 'thumbnail', 'gallery', 'lifestyle', 'print'],
              },
              url: { type: 'string' },
              name: { type: 'string' },
            },
            required: ['role', 'url', 'name'],
            additionalProperties: false,
          },
        },
      },
      required: ['productId', 'media'],
      additionalProperties: false,
    },
    execute: (args) =>
      said('Écriture des visuels', async () => {
        const twice = duplicatedSingleRole(args.media);
        if (twice !== null) {
          return `Rien n'est écrit : le rôle ${twice} est porté plusieurs fois, une fiche n'en a qu'un.`;
        }
        const media: MediaSlot[] = args.media.map((slot) => ({
          role: slot.role,
          url: slot.url,
          name: slot.name,
        }));
        await products.saveMedia(args.productId, media);
        return `${String(media.length)} visuel(s) écrit(s) sur ${args.productId}.`;
      }),
  });

  return ['pim_variant_set_pricing', 'pim_vat_rates_list', 'pim_set_vat', 'pim_product_set_media'];
}
