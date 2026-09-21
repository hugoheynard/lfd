import { declareExperimentalWebMcpTool, inject } from '@angular/core';
import type { SalesChannels } from '@lfd/pim-contracts';

import { CategoryStore } from '../pim/catalogue/category-store';
import { ProductHttpApi } from '../pim/catalogue/product-http-api';
import type { NutritionValues } from '../pim/data/models';

/**
 * **Les outils WebMCP du référentiel** — ce qu'un agent peut faire sur le PIM
 * sans passer par le clic.
 *
 * Chaque outil vise une **route HTTP**, jamais un store d'écran. C'est la
 * décision centrale du plan (`documentation/pim/plan-outils-webmcp-pim.md`, §3)
 * et elle vient d'une contradiction : branché sur `ProductFormStore`, un outil
 * fabrique des états que l'écran ne peut pas produire — allergènes en doublon,
 * « aucun allergène » avec une liste non vide, nom écrit dans la langue que le
 * sélecteur affichait. Viser `PUT :id/identity` fait passer l'outil par la même
 * porte que l'écran, validations serveur comprises.
 *
 * `ProductHttpApi` est `providedIn: 'root'` et l'intercepteur staff attache le
 * jeton : un outil hérite donc de l'authentification de la session, sans qu'un
 * secret n'existe nulle part ici.
 *
 * 🔴 **Ces outils écrivent dans le VRAI référentiel**, celui de l'environnement
 * où l'application tourne. Ils n'ont pas de mode bac à sable, et c'est
 * volontaire : un bac à sable ferait croire qu'on s'entraîne.
 */

/** Ce que rend un outil : Angular ne transforme rien, la JSDoc dit « raw string ». */
type ToolText = string;

/**
 * Rend un refus **lisible**, jamais une exception.
 *
 * Un outil qui jette casse la boucle de l'agent, qui recommence à l'aveugle. Un
 * outil qui dit « le serveur a refusé, et voici pourquoi » se corrige au coup
 * suivant.
 */
async function said(what: string, run: () => Promise<string>): Promise<ToolText> {
  try {
    return await run();
  } catch (caught) {
    const detail = caught instanceof Error ? caught.message : String(caught);
    return `${what} — REFUSÉ : ${detail}`;
  }
}

/**
 * Déclare la trousse et rend les noms déclarés, pour que l'écran puisse les
 * afficher.
 *
 * 🔴 À appeler depuis un **contexte d'injection de composant**, jamais depuis
 * `app.config.ts` : les fournisseurs de la racine s'exécutent au démarrage,
 * avant qu'un agent ait pu poser `document.modelContext`. Un outil déclaré là
 * ne s'enregistrerait jamais (plan §4).
 */
export function declarePimAgentTools(): readonly string[] {
  const products = inject(ProductHttpApi);
  const categories = inject(CategoryStore);

  void declareExperimentalWebMcpTool({
    name: 'pim_categories_list',
    description:
      'Liste les familles (catégories) du référentiel avec leur identifiant. À appeler AVANT pim_product_create, qui exige un categoryId.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    execute: () =>
      said('Lecture des familles', async () => {
        await categories.reload();
        const rows = categories
          .items()
          .map((category) => `${category.id} — ${category.name.fr ?? '(sans nom fr)'}`);
        return rows.length === 0 ? 'Aucune famille.' : rows.join('\n');
      }),
  });

  void declareExperimentalWebMcpTool({
    name: 'pim_products_list',
    description:
      'Liste les fiches produit : identifiant, référence, nom source et statut. Aucun argument.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    execute: () =>
      said('Lecture du catalogue', async () => {
        const rows = await products.list();
        return rows.length === 0
          ? 'Aucune fiche.'
          : rows
              .map((p) => `${p.id} — ${p.sku} — ${p.name.fr ?? '(sans nom fr)'} — ${p.status}`)
              .join('\n');
      }),
  });

  void declareExperimentalWebMcpTool({
    name: 'pim_product_read',
    description:
      'Lit une fiche produit en détail : identité, éditorial, allergènes, nutrition, déclinaisons (avec leur variantId, nécessaire pour la nutrition).',
    inputSchema: {
      type: 'object',
      properties: { productId: { type: 'string' } },
      required: ['productId'],
      additionalProperties: false,
    },
    execute: (args) =>
      said('Lecture de la fiche', async () => {
        const detail = await products.getDetail(args.productId);
        if (detail === null) {
          return `Aucune fiche pour l'identifiant ${args.productId}.`;
        }
        const variants = detail.product.variants
          .map((v) => `  ${v.id} — ${v.sku}${v.isDefault ? ' (par défaut)' : ''}`)
          .join('\n');
        // `null` sur les allergènes = fiche non renseignée. On le DIT, plutôt
        // que de rendre une liste vide qui affirmerait « aucun allergène ».
        const allergens =
          detail.allergens === null
            ? 'non renseignés'
            : detail.allergens.length === 0
              ? 'aucun (déclaré)'
              : detail.allergens.join(', ');
        return [
          `id        : ${detail.product.id}`,
          `sku       : ${detail.product.sku}`,
          `nom (fr)  : ${detail.product.name.fr ?? '(vide)'}`,
          `nature    : ${detail.product.kind}`,
          `famille   : ${detail.product.categoryId}`,
          `statut    : ${detail.product.status}`,
          `marque    : ${detail.editorial.brand}`,
          `allergènes: ${allergens}`,
          `déclinaisons :`,
          variants,
        ].join('\n');
      }),
  });

  void declareExperimentalWebMcpTool({
    name: 'pim_product_create',
    description:
      'Crée une fiche produit. `name` est le nom en français (langue source). `kind` vaut daily, made_to_order ou resale. `categoryId` vient de pim_categories_list. Ne pose ni prix ni publication.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        kind: { type: 'string', enum: ['daily', 'made_to_order', 'resale'] },
        categoryId: { type: 'string' },
        descriptionFr: { type: 'string' },
      },
      required: ['name', 'kind', 'categoryId'],
      additionalProperties: false,
    },
    execute: (args) =>
      said('Création de la fiche', async () => {
        const created = await products.create({
          name: { fr: args.name },
          kind: args.kind,
          categoryId: args.categoryId,
          ...(args.descriptionFr === undefined ? {} : { descriptionFr: args.descriptionFr }),
        });
        return `Fiche créée : ${created.id}`;
      }),
  });

  void declareExperimentalWebMcpTool({
    name: 'pim_product_set_identity',
    description:
      "Remplace l'identité d'une fiche : nom français, nature, famille. Les trois vont ensemble — le serveur les reçoit en une requête.",
    inputSchema: {
      type: 'object',
      properties: {
        productId: { type: 'string' },
        name: { type: 'string' },
        kind: { type: 'string', enum: ['daily', 'made_to_order', 'resale'] },
        categoryId: { type: 'string' },
      },
      required: ['productId', 'name', 'kind', 'categoryId'],
      additionalProperties: false,
    },
    execute: (args) =>
      said("Écriture de l'identité", async () => {
        await products.saveIdentity(args.productId, {
          name: { fr: args.name },
          kind: args.kind,
          categoryId: args.categoryId,
        });
        return `Identité écrite sur ${args.productId}.`;
      }),
  });

  void declareExperimentalWebMcpTool({
    name: 'pim_product_set_editorial',
    description:
      "Remplace la couche éditoriale (français). Un champ omis est effacé : le serveur remplace la couche entière. Lire d'abord avec pim_product_read.",
    inputSchema: {
      type: 'object',
      properties: {
        productId: { type: 'string' },
        brand: { type: 'string' },
        descriptionShort: { type: 'string' },
        descriptionLong: { type: 'string' },
        story: { type: 'string' },
        pairing: { type: 'string' },
      },
      required: ['productId', 'brand'],
      additionalProperties: false,
    },
    execute: (args) =>
      said("Écriture de l'éditorial", async () => {
        // `null` plutôt que `{ fr: '' }` pour l'absence : une valeur localisée
        // vide serait comptée comme renseignée par tout ce qui lit les locales.
        const text = (value: string | undefined) => (value === undefined ? null : { fr: value });
        await products.saveEditorial(args.productId, {
          brand: args.brand,
          descriptionShort: text(args.descriptionShort),
          descriptionLong: text(args.descriptionLong),
          story: text(args.story),
          pairing: text(args.pairing),
          seoTitle: null,
          seoDescription: null,
        });
        return `Éditorial écrit sur ${args.productId}.`;
      }),
  });

  void declareExperimentalWebMcpTool({
    name: 'pim_variant_set_nutrition',
    description:
      "Pose les valeurs nutritionnelles d'une déclinaison. `variantId` vient de pim_product_read. Une valeur omise LAISSE celle déjà en place. N'écrit pas les allergènes : ils sont relus et réécrits à l'identique.",
    // Les huit clés sont écrites en clair, et pas dérivées d'une liste : le
    // paramètre de type est `const`, donc un schéma construit par
    // `Object.fromEntries` perd l'inférence et `args` n'aurait que les deux
    // identifiants (constaté à la compilation, 2026-09-10).
    inputSchema: {
      type: 'object',
      properties: {
        productId: { type: 'string' },
        variantId: { type: 'string' },
        energyKcal: { type: 'number' },
        fatG: { type: 'number' },
        saturatedFatG: { type: 'number' },
        carbsG: { type: 'number' },
        sugarsG: { type: 'number' },
        proteinG: { type: 'number' },
        saltG: { type: 'number' },
        glycemicIndex: { type: 'number' },
      },
      required: ['productId', 'variantId'],
      additionalProperties: false,
    },
    execute: (args) =>
      said('Écriture de la nutrition', async () => {
        // Le backend remplace la déclaration ENTIÈRE : allergènes et nutrition
        // partent ensemble. On relit donc les allergènes pour les réécrire tels
        // quels — sans quoi poser une valeur nutritionnelle les effacerait.
        const detail = await products.getDetail(args.productId);
        if (detail === null) {
          return `Aucune fiche pour l'identifiant ${args.productId}.`;
        }
        if (detail.allergens === null) {
          return (
            "Refusé ici : la fiche réglementaire n'est pas renseignée, et écrire la " +
            'nutrition la remplacerait par une affirmation « aucun allergène ». ' +
            "À renseigner à l'écran d'abord."
          );
        }
        const kept = detail.nutrition;
        const nutrition: NutritionValues = {
          energyKcal: args.energyKcal ?? kept.energyKcal,
          fatG: args.fatG ?? kept.fatG,
          saturatedFatG: args.saturatedFatG ?? kept.saturatedFatG,
          carbsG: args.carbsG ?? kept.carbsG,
          sugarsG: args.sugarsG ?? kept.sugarsG,
          proteinG: args.proteinG ?? kept.proteinG,
          saltG: args.saltG ?? kept.saltG,
          glycemicIndex: args.glycemicIndex ?? kept.glycemicIndex,
        };
        await products.saveNutrition(args.productId, args.variantId, {
          allergens: detail.allergens,
          mayContain: detail.mayContain,
          nutrition,
        });
        return `Nutrition écrite sur ${args.variantId}.`;
      }),
  });

  void declareExperimentalWebMcpTool({
    name: 'pim_product_set_channels',
    description:
      'Règle où la fiche se vend. mode=inherit rend les canaux à la famille ; mode=override impose la liste fournie (une paire pointOfSaleId + context par canal vendu).',
    inputSchema: {
      type: 'object',
      properties: {
        productId: { type: 'string' },
        mode: { type: 'string', enum: ['inherit', 'override'] },
        channels: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              pointOfSaleId: { type: 'string' },
              context: { type: 'string' },
            },
            required: ['pointOfSaleId', 'context'],
            additionalProperties: false,
          },
        },
      },
      required: ['productId', 'mode'],
      additionalProperties: false,
    },
    execute: (args) =>
      said('Écriture des canaux', async () => {
        // `null` = hérité de la famille ; `[]` = vendu nulle part. Les deux
        // s'écrivent, et ce n'est pas la même phrase — d'où `mode` explicite
        // plutôt qu'un tableau vide qu'on aurait interprété.
        if (args.mode === 'inherit') {
          await products.saveChannels(args.productId, null);
          return `Canaux rendus à la famille sur ${args.productId}.`;
        }
        const channels: SalesChannels = (args.channels ?? []).map((channel) => ({
          pointOfSaleId: channel.pointOfSaleId,
          context: channel.context,
        }));
        await products.saveChannels(args.productId, channels);
        return `${channels.length} canal(aux) posé(s) sur ${args.productId}.`;
      }),
  });

  return [
    'pim_categories_list',
    'pim_products_list',
    'pim_product_read',
    'pim_product_create',
    'pim_product_set_identity',
    'pim_product_set_editorial',
    'pim_variant_set_nutrition',
    'pim_product_set_channels',
  ];
}
