import { formatPercent } from '../../data/channels';
import type { Category, Emplacement, Product, TvaRate } from '../../data/models';
import { generateFiches, tvaTagFromPercent } from './fiches';

/** Une fiche telle qu'elle apparaît dans une collection. */
export interface CollectionEntry {
  handle: string;
  title: string;
  boutiques: string[];
}

/** Une collection Shopify (une lecture des tags), avec son contenu. */
export interface Collection {
  tag: string;
  label: string;
  /** Sous-titre — taux, mode… */
  sub: string;
  entries: CollectionEntry[];
}

/** Une des trois familles de collections du doc. */
export interface CollectionFamily {
  key: 'tva' | 'navigation' | 'salle';
  title: string;
  description: string;
  /** Visibilité côté public — répond à « ces tags apparaissent-ils au client ? ». */
  visibility: string;
  /** `true` si les tags/handles sont exposés au public (URLs, rayons). */
  isPublic: boolean;
  collections: Collection[];
}

interface FicheContext {
  handle: string;
  title: string;
  boutiques: string[];
  tvaTag: string;
  mode: 'emporter' | 'surPlace';
  categoryId: string;
}

function toEntry(f: FicheContext): CollectionEntry {
  return { handle: f.handle, title: f.title, boutiques: f.boutiques };
}

/**
 * Les collections que le paramétrage **génère** — trois lectures indépendantes
 * des tags (doc §5) : TVA (Famille A), navigation (B), salle (C). Chaque
 * collection descend jusqu'aux fiches (produits) qu'elle contient.
 */
export function buildCollections(
  products: readonly Product[],
  categories: readonly Category[],
  rates: readonly TvaRate[],
  emplacements: readonly Emplacement[],
): CollectionFamily[] {
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const regimeById = new Map(rates.map((r) => [r.id, r]));

  const fiches: FicheContext[] = [];
  for (const product of products) {
    const category = categoryById.get(product.categoryId);
    if (category === undefined) {
      continue;
    }
    for (const fiche of generateFiches(product, category, regimeById, emplacements)) {
      fiches.push({
        handle: fiche.handle,
        title: fiche.title,
        boutiques: fiche.boutiques,
        tvaTag: fiche.tvaTag,
        mode: fiche.mode,
        categoryId: category.id,
      });
    }
  }

  const active = categories.filter((c) => !c.isArchived);

  // Famille A — TVA : une collection par taux, groupée par handle. Le handle
  // se DÉRIVE du taux ici : il est du vocabulaire Shopify, et cette projection
  // est justement l'endroit qui parle Shopify.
  const tva: Collection[] = rates.map((rate) => {
    const tag = tvaTagFromPercent(rate.percent);
    return {
      tag,
      label: rate.name,
      sub: `${tag} · ${formatPercent(rate.percent)}`,
      entries: fiches.filter((f) => f.tvaTag === tag).map(toEntry),
    };
  });

  // Famille B — Navigation : un rayon par catégorie, fiches à emporter seulement.
  const navigation: Collection[] = active.map((category) => ({
    tag: category.slug.fr,
    label: category.name.fr,
    sub: 'à emporter',
    entries: fiches
      .filter((f) => f.categoryId === category.id && f.mode === 'emporter')
      .map(toEntry),
  }));

  // Famille C — Salle : sur place par catégorie ; seulement là où on sert.
  const salle: Collection[] = active
    .map((category) => ({
      tag: `sur-place-${category.slug.fr}`,
      label: category.name.fr,
      sub: 'sur place',
      entries: fiches
        .filter((f) => f.categoryId === category.id && f.mode === 'surPlace')
        .map(toEntry),
    }))
    .filter((collection) => collection.entries.length > 0);

  return [
    {
      key: 'tva',
      title: 'TVA — Famille A',
      description: 'Techniques ; portent les dérogations de taux.',
      visibility: 'Invisible — aucune page ni menu (calcul de taxe seul)',
      isPublic: false,
      collections: tva,
    },
    {
      key: 'navigation',
      title: 'Click and collect public',
      description:
        'Le catalogue en ligne du site : rayons publics, commande puis retrait en boutique. Uniquement les fiches à emporter.',
      visibility: 'Public — URLs et titres de rayon',
      isPublic: true,
      collections: navigation,
    },
    {
      key: 'salle',
      title: 'Sur place — click-collect immédiat',
      description:
        'Commandé depuis l’URL du QR de la table, service en salle par-dessus. Les fiches sur place, hors navigation publique.',
      visibility: 'Non indexée — accessible seulement par le QR',
      isPublic: false,
      collections: salle,
    },
  ];
}

/** Total de fiches d'une famille — le compteur du nœud racine. */
export function familyCount(family: CollectionFamily): number {
  return family.collections.reduce((sum, c) => sum + c.entries.length, 0);
}
