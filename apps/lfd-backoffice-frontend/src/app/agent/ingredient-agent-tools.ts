import { declareExperimentalWebMcpTool, inject } from '@angular/core';
import type { CreateIngredientPayload, IngredientView } from '@lfd/pim-contracts';

import { IngredientHttpApi } from '../pim/provenance/ingredient-http-api';

import { said } from './agent-tool-text';
import {
  appellationsText,
  citedAllergensText,
  ingredientSearchText,
  ingredientText,
  productIngredientsText,
} from './ingredient-agent-text';

/** Les outils de lecture — déclarés avec `pim_catalog:read`. */
export const INGREDIENT_READ_TOOLS = [
  'ingredient_search',
  'ingredient_get',
  'ingredient_appellations_list',
  'ingredient_product_list',
  'ingredient_product_allergens',
] as const;

/** Les outils d'écriture — déclarés en plus avec `pim_catalog:write`. */
export const INGREDIENT_WRITE_TOOLS = [
  'ingredient_create',
  'ingredient_set_allergens',
  'ingredient_product_add',
  'ingredient_product_remove',
  'ingredient_product_reorder',
] as const;

const STRING_LIST = { type: 'array', items: { type: 'string' } } as const;
const PRODUCT_ID = { productId: { type: 'string' } } as const;

const NOT_DECLARATION =
  'Ne touche JAMAIS aux allergènes déclarés d’une déclinaison : ceux-là se décident sur la fiche (pim_product_read pour les lire).';

/**
 * **Les outils WebMCP des ingrédients** (Hugo, 2026-10-20) — Référentiel →
 * Ingrédients et la section « Ingrédients » d'une fiche, sans le clic.
 *
 * Chaque outil vise la route de l'écran par {@link IngredientHttpApi} : même
 * mur (`@AdminSurface("pim_catalog")`), mêmes refus du domaine (clé déjà
 * prise, code d'allergène inconnu, ingrédient inconnu), rendus par
 * {@link said} avec le message du serveur. Chaque écriture relit et rend
 * l'état d'après — le serveur dédoublonne et range en silence.
 *
 * Les écritures de liste (`PUT` = la liste ENTIÈRE) partent de la liste lue :
 * un code ou une clé omis n'est jamais effacé par mégarde.
 *
 * Absents, délibérément : corriger ou effacer un ingrédient, et toute
 * écriture d'appellation — un signe officiel et l'effacement d'une matière
 * citée restent des gestes de l'écran.
 */
export function declareIngredientAgentTools(canWrite: boolean): readonly string[] {
  const api = inject(IngredientHttpApi);

  async function byKey(key: string): Promise<IngredientView | undefined> {
    return (await api.ingredients()).find((row) => row.key === key.trim());
  }

  void declareExperimentalWebMcpTool({
    name: 'ingredient_search',
    description:
      'Cherche dans le référentiel des ingrédients : `query` sur le nom (toute langue), la clé, l’appellation (code, signe, libellé) ou un code d’allergène GS1 exact qu’il contient (ex. GLU) ; vide = tout. Une ligne par ingrédient : clé, origine, appellation, allergènes qu’il contient, nombre de fiches qui le citent. Lecture seule.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      additionalProperties: false,
    },
    execute: (args) =>
      said('Recherche d’ingrédients', async () =>
        ingredientSearchText(await api.ingredients(), args.query ?? ''),
      ),
  });

  void declareExperimentalWebMcpTool({
    name: 'ingredient_get',
    description:
      'Lit un ingrédient par sa `key` (ingredient_search) : nom, origine, description, appellation, allergènes qu’il contient, et combien de fiches le citent. Lecture seule.',
    inputSchema: {
      type: 'object',
      properties: { key: { type: 'string' } },
      required: ['key'],
      additionalProperties: false,
    },
    execute: (args) =>
      said('Lecture de l’ingrédient', async () => {
        const found = await byKey(args.key);
        return found === undefined
          ? `Aucun ingrédient n’a la clé ${args.key}. Chercher par ingredient_search.`
          : ingredientText(found);
      }),
  });

  void declareExperimentalWebMcpTool({
    name: 'ingredient_appellations_list',
    description:
      'Liste les appellations (AOP, IGP, Label Rouge…) : code, signe, libellé, active ou retirée, nombre d’ingrédients qui la portent. Lecture seule.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    execute: () =>
      said('Lecture des appellations', async () => appellationsText(await api.appellations())),
  });

  void declareExperimentalWebMcpTool({
    name: 'ingredient_product_list',
    description:
      'Les ingrédients qu’une fiche (`productId`, pim_products_list) cite, dans l’ordre affiché — un ordre éditorial, pas l’ordre réglementaire par masse, et sans quantité. Lecture seule.',
    inputSchema: {
      type: 'object',
      properties: PRODUCT_ID,
      required: ['productId'],
      additionalProperties: false,
    },
    execute: (args) =>
      said('Lecture de la composition', async () =>
        productIngredientsText(args.productId, await api.ofProduct(args.productId)),
      ),
  });

  void declareExperimentalWebMcpTool({
    name: 'ingredient_product_allergens',
    description:
      'Les allergènes que les ingrédients d’une fiche (`productId`) PROPOSENT, et pour chaque déclinaison ceux proposés et non déclarés. Les ingrédients proposent, la fiche décide : une proposition vide ne prouve rien, et rien n’est repris tout seul. Lecture seule.',
    inputSchema: {
      type: 'object',
      properties: PRODUCT_ID,
      required: ['productId'],
      additionalProperties: false,
    },
    execute: (args) =>
      said('Lecture des allergènes proposés', async () =>
        citedAllergensText(await api.citedAllergens(args.productId)),
      ),
  });

  if (!canWrite) {
    return INGREDIENT_READ_TOOLS;
  }

  declareWriteTools(api, byKey);
  return [...INGREDIENT_READ_TOOLS, ...INGREDIENT_WRITE_TOOLS];
}

function declareWriteTools(
  api: IngredientHttpApi,
  byKey: (key: string) => Promise<IngredientView | undefined>,
): void {
  async function reread(key: string): Promise<string> {
    const after = await byKey(key);
    return after === undefined ? `clé ${key} (relecture : introuvable)` : ingredientText(after);
  }

  async function rewriteProduct(
    productId: string,
    change: (keys: readonly string[]) => readonly string[] | string,
  ): Promise<string> {
    const current = (await api.ofProduct(productId)).map((row) => row.key);
    const next = change(current);
    if (typeof next === 'string') {
      return next;
    }
    if (next.length === current.length && next.every((key, at) => key === current[at])) {
      return `RIEN À FAIRE — ${productIngredientsText(productId, await api.ofProduct(productId))}`;
    }
    await api.setOfProduct(productId, { keys: [...next] });
    return `MODIFIÉ — ${productIngredientsText(productId, await api.ofProduct(productId))}`;
  }

  void declareExperimentalWebMcpTool({
    name: 'ingredient_create',
    description:
      'Déclare un ingrédient au référentiel, comme « Nouvel ingrédient » à l’écran. `key` : identité gelée (minuscules, chiffres, tirets). `nameFr` obligatoire ; facultatifs : `origin` (« Savoie, France »), `descriptionFr`, `appellationCode` (ingredient_appellations_list). Ses allergènes se posent ensuite par ingredient_set_allergens. Rend l’ingrédient relu.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string' },
        nameFr: { type: 'string' },
        origin: { type: 'string' },
        descriptionFr: { type: 'string' },
        appellationCode: { type: 'string' },
      },
      required: ['key', 'nameFr'],
      additionalProperties: false,
    },
    execute: (args) =>
      said('Création de l’ingrédient', async () => {
        const payload: CreateIngredientPayload = {
          key: args.key.trim(),
          name: { fr: args.nameFr },
          origin: args.origin ?? '',
          ...(args.descriptionFr === undefined ? {} : { description: { fr: args.descriptionFr } }),
          ...(args.appellationCode === undefined ? {} : { appellationCode: args.appellationCode }),
        };
        await api.create(payload);
        return `CRÉÉ — ${await reread(payload.key)}`;
      }),
  });

  void declareExperimentalWebMcpTool({
    name: 'ingredient_set_allergens',
    description: `Change ce qu’un ingrédient (\`key\`) CONTIENT : \`add\` et \`remove\`, des codes GS1 (référentiel complet, codes hors obligation UE compris). Un code non nommé GARDE son état. Un code inconnu est refusé par le serveur. ${NOT_DECLARATION} Rend l’ingrédient relu.`,
    inputSchema: {
      type: 'object',
      properties: { key: { type: 'string' }, add: STRING_LIST, remove: STRING_LIST },
      required: ['key'],
      additionalProperties: false,
    },
    execute: (args) =>
      said('Allergènes de l’ingrédient', async () => {
        const current = await byKey(args.key);
        if (current === undefined) {
          return `Allergènes de l’ingrédient — REFUSÉ : aucun ingrédient n’a la clé ${args.key}. Chercher par ingredient_search.`;
        }
        const removed = new Set((args.remove ?? []).map((code) => code.trim()));
        const codes = [
          ...new Set([...current.allergens, ...(args.add ?? []).map((code) => code.trim())]),
        ].filter((code) => !removed.has(code));
        await api.setAllergens(current.key, { codes });
        return `MODIFIÉ — ${await reread(current.key)}`;
      }),
  });

  void declareExperimentalWebMcpTool({
    name: 'ingredient_product_add',
    description: `Ajoute un ingrédient (\`key\`) à ce qu’une fiche (\`productId\`) cite, en fin de liste ou à \`position\` (1 = en tête). Déjà cité : rien à faire. ${NOT_DECLARATION} Rend la composition relue.`,
    inputSchema: {
      type: 'object',
      properties: { ...PRODUCT_ID, key: { type: 'string' }, position: { type: 'integer' } },
      required: ['productId', 'key'],
      additionalProperties: false,
    },
    execute: (args) =>
      said('Ajout à la composition', async () => {
        const key = args.key.trim();
        if ((await byKey(key)) === undefined) {
          return `Ajout à la composition — REFUSÉ : aucun ingrédient n’a la clé ${key}. Le créer d’abord (ingredient_create).`;
        }
        return rewriteProduct(args.productId, (keys) => {
          if (keys.includes(key)) {
            return keys;
          }
          const at = Math.min(Math.max((args.position ?? keys.length + 1) - 1, 0), keys.length);
          return [...keys.slice(0, at), key, ...keys.slice(at)];
        });
      }),
  });

  void declareExperimentalWebMcpTool({
    name: 'ingredient_product_remove',
    description: `Retire un ingrédient (\`key\`) de ce qu’une fiche (\`productId\`) cite ; l’ingrédient reste au référentiel. ${NOT_DECLARATION} Rend la composition relue.`,
    inputSchema: {
      type: 'object',
      properties: { ...PRODUCT_ID, key: { type: 'string' } },
      required: ['productId', 'key'],
      additionalProperties: false,
    },
    execute: (args) =>
      said('Retrait de la composition', () =>
        rewriteProduct(args.productId, (keys) =>
          keys.includes(args.key.trim())
            ? keys.filter((key) => key !== args.key.trim())
            : `RIEN À FAIRE — la fiche ${args.productId} ne cite pas ${args.key}.`,
        ),
      ),
  });

  void declareExperimentalWebMcpTool({
    name: 'ingredient_product_reorder',
    description: `Réordonne ce qu’une fiche (\`productId\`) cite : \`keys\` = les MÊMES clés que ingredient_product_list, dans le nouvel ordre (ni ajout ni retrait — pour ça, ingredient_product_add / _remove). ${NOT_DECLARATION} Rend la composition relue.`,
    inputSchema: {
      type: 'object',
      properties: { ...PRODUCT_ID, keys: STRING_LIST },
      required: ['productId', 'keys'],
      additionalProperties: false,
    },
    execute: (args) =>
      said('Ordre de la composition', () =>
        rewriteProduct(args.productId, (keys) => reordered(keys, args.keys)),
      ),
  });
}

/** Le nouvel ordre, s'il est une permutation exacte de l'actuel — sinon le refus nommé. */
export function reordered(
  current: readonly string[],
  wanted: readonly string[],
): readonly string[] | string {
  const next = wanted.map((key) => key.trim());
  const same =
    next.length === current.length &&
    new Set(next).size === next.length &&
    next.every((key) => current.includes(key));
  return same
    ? next
    : `Ordre de la composition — REFUSÉ : \`keys\` doit reprendre exactement les ${current.length} clé(s) citées (${current.join(', ') || 'aucune'}), sans ajout, retrait ni doublon.`;
}
