import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { Category, type CategorySnapshot } from "../domain/entities/category.js";
import {
  CategoryRankTakenError,
  CategorySlugTakenError,
} from "../domain/errors/category-errors.js";
import { CategoryRepository } from "../domain/ports/category.repository.js";
import {
  localizedColumn,
  readLocalizedColumn,
  salesChannelsColumn,
  violatedConstraint,
} from "../../shared/infrastructure/json-readers.js";
import {
  normalizeSalesChannels,
  referencedLocations,
  type SalesChannels,
} from "../../shared/domain/value-objects/sales-channels.js";

interface CategoryRow {
  id: string;
  name: unknown;
  slug: unknown;
  parentId: string | null;
  position: number;
  isArchived: boolean;
  contextVat: readonly { vatRateId: string; context: { key: string } }[];
  channels: readonly { locationId: string | null; contextKey: string }[];
}

/**
 * Les taux viennent de la jointure, les canaux de `category_channel`. Les deux
 * colonnes qui les portaient — trois taux nommés, une matrice `jsonb` — ont
 * disparu de la lecture ; la seconde reste ÉCRITE jusqu'à d-3.
 */
const CATEGORY_WITH_VAT = {
  contextVat: { select: { vatRateId: true, context: { select: { key: true } } } },
  channels: { select: { locationId: true, contextKey: true } },
} as const;

/**
 * Les lignes de `category_channel` en paires du domaine.
 *
 * Normalisées à la lecture, pas seulement à l'écriture : la base ne garantit
 * aucun ordre, et un « avant/après » de journal comparerait alors deux
 * ensembles identiques rangés différemment.
 */
function toChannels(
  rows: readonly { locationId: string | null; contextKey: string }[],
): SalesChannels {
  return normalizeSalesChannels(
    rows.map((row) => ({ locationId: row.locationId, context: row.contextKey })),
  );
}

function toCategory(row: CategoryRow): Category {
  const vatByContext: Record<string, string> = {};
  for (const line of row.contextVat) {
    vatByContext[line.context.key] = line.vatRateId;
  }
  return Category.reconstitute({
    id: row.id,
    name: readLocalizedColumn(row.name, "category.name"),
    slug: readLocalizedColumn(row.slug, "category.slug"),
    parentId: row.parentId,
    position: row.position,
    isArchived: row.isArchived,
    channelPreset: toChannels(row.channels),
    vatByContext,
  });
}

/** Les colonnes que l'agrégat possède — l'id n'en est pas une, il identifie. */
function toColumns(snapshot: CategorySnapshot) {
  return {
    name: localizedColumn(snapshot.name),
    slug: localizedColumn(snapshot.slug),
    parentId: snapshot.parentId,
    position: snapshot.position,
    isArchived: snapshot.isArchived,
    channelPreset: salesChannelsColumn(snapshot.channelPreset),
  };
}

@Injectable()
export class PrismaCategoryRepository extends CategoryRepository {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async findById(id: string): Promise<Category | null> {
    const row = await this.prisma.category.findUnique({
      where: { id },
      include: CATEGORY_WITH_VAT,
    });
    return row === null ? null : toCategory(row);
  }

  /** Filtre sur le chemin `fr` de la colonne `jsonb` — pas de lecture en mémoire. */
  async findBySlugFr(slugFr: string): Promise<Category | null> {
    const row = await this.prisma.category.findFirst({
      where: { slug: { path: ["fr"], equals: slugFr } },
      include: CATEGORY_WITH_VAT,
    });
    return row === null ? null : toCategory(row);
  }

  async listChildren(parentId: string | null): Promise<Category[]> {
    const rows = await this.prisma.category.findMany({
      where: { parentId },
      orderBy: [{ position: "asc" }],
      include: CATEGORY_WITH_VAT,
    });
    return rows.map(toCategory);
  }

  async listAll(): Promise<Category[]> {
    const rows = await this.prisma.category.findMany({
      orderBy: [{ position: "asc" }],
      include: CATEGORY_WITH_VAT,
    });
    return rows.map(toCategory);
  }

  async add(category: Category): Promise<void> {
    const snapshot = category.snapshot();
    await guard(snapshot, () =>
      this.prisma.$transaction([
        this.prisma.category.create({ data: { id: snapshot.id, ...toColumns(snapshot) } }),
        ...this.vatOperations(snapshot),
        ...this.locationOperations(snapshot),
        ...this.channelOperations(snapshot),
      ]),
    );
  }

  async save(category: Category): Promise<void> {
    const snapshot = category.snapshot();
    await guard(snapshot, () =>
      this.prisma.$transaction([
        this.prisma.category.update({ where: { id: snapshot.id }, data: toColumns(snapshot) }),
        ...this.vatOperations(snapshot),
        ...this.locationOperations(snapshot),
        ...this.channelOperations(snapshot),
      ]),
    );
  }

  /**
   * Une seule transaction : une fratrie à moitié renumérotée porterait des
   * rangs en double, et l'ordre affiché deviendrait celui de l'insertion.
   *
   * **En deux passes**, depuis que `category_sibling_rank_unique` garde les
   * rangs. Une permutation passe forcément par un état où deux familles visent
   * la même place (0 ↔ 1), et la contrainte est vérifiée à chaque `UPDATE` —
   * elle sauterait sur le premier. Le premier passage GARE donc les rangs hors
   * de la plage utilisée (négatifs, distincts entre eux), le second pose les
   * rangs définitifs. Deux fois plus d'écritures sur un geste rare : c'est le
   * prix d'une contrainte qui, elle, tient aussi quand deux personnes rangent
   * la même fratrie en même temps.
   */
  async saveAll(categories: readonly Category[]): Promise<void> {
    if (categories.length === 0) {
      return;
    }
    await this.prisma.$transaction([
      ...categories.map((category, index) =>
        this.prisma.category.update({
          where: { id: category.snapshot().id },
          data: { position: -(index + 1) },
        }),
      ),
      ...categories.flatMap((category) => {
        const snapshot = category.snapshot();
        return [
          this.prisma.category.update({
            where: { id: snapshot.id },
            data: toColumns(snapshot),
          }),
          ...this.vatOperations(snapshot),
          ...this.locationOperations(snapshot),
          ...this.channelOperations(snapshot),
        ];
      }),
    ]);
  }

  /**
   * Remplace les taux d'une famille : on efface, puis on réécrit.
   *
   * Un `upsert` par contexte laisserait vivre la ligne d'un contexte qu'on
   * vient de retirer — et « plus de taux » ressemblerait à « taux inchangé ».
   * Ces opérations partent dans la MÊME transaction que la famille : une
   * catégorie enregistrée sans ses taux serait une famille qui ne facture plus.
   *
   * Le lien entre clé de contexte et identifiant passe par une sous-requête
   * (`connect` par `key`) : le dépôt n'a pas à charger le registre, et une clé
   * inconnue casse l'écriture au lieu de créer une ligne orpheline. L'agrégat,
   * lui, l'a déjà refusée — c'est la seconde barrière, pas la première.
   */
  private vatOperations(snapshot: CategorySnapshot) {
    return [
      this.prisma.categoryContextVat.deleteMany({ where: { categoryId: snapshot.id } }),
      ...Object.entries(snapshot.vatByContext).map(([contextKey, vatRateId]) =>
        this.prisma.categoryContextVat.create({
          data: {
            category: { connect: { id: snapshot.id } },
            context: { connect: { key: contextKey } },
            vatRate: { connect: { id: vatRateId } },
          },
        }),
      ),
    ];
  }

  /**
   * Réécrit l'**index de référence** des emplacements cités par la grille.
   *
   * Il dérive de `channel_preset`, et part dans la MÊME transaction que la
   * colonne dont il dérive : hors transaction, l'un des deux pourrait manquer,
   * et l'index deviendrait une seconde vérité au lieu d'un miroir.
   *
   * Il existe pour une raison qu'aucune colonne ne peut porter : une clé
   * étrangère ne se pose pas dans du `jsonb`. Sans lui, supprimer un
   * emplacement ne se protégeait que par une lecture — et entre le compte et
   * la suppression, une grille pouvait se mettre à le citer.
   *
   * Effacer-puis-réécrire, comme les taux : un `upsert` laisserait vivre la
   * ligne d'un emplacement qu'on vient de décocher, et « plus référencé »
   * ressemblerait à « référence inchangée ».
   */
  private locationOperations(snapshot: CategorySnapshot) {
    const locationIds = referencedLocations(snapshot.channelPreset);
    return [
      this.prisma.categoryLocationRef.deleteMany({ where: { categoryId: snapshot.id } }),
      ...(locationIds.length === 0
        ? []
        : [
            this.prisma.categoryLocationRef.createMany({
              data: locationIds.map((locationId) => ({ categoryId: snapshot.id, locationId })),
            }),
          ]),
    ];
  }

  /**
   * Écrit ce que la famille vend, **une ligne par (lieu, contexte)** — la forme
   * cible de la matrice (C0-d, tranche d-1).
   *
   * Dans la MÊME transaction que la colonne dont elle dérive, comme les taux et
   * l'index de référence : hors transaction, l'une des deux pourrait manquer, et
   * la table deviendrait une seconde vérité au lieu d'un miroir.
   *
   * Personne ne la LIT encore — c'est le propre d'une tranche « étendre ». La
   * bascule d-2 inverse la source et le miroir.
   */
  private channelOperations(snapshot: CategorySnapshot) {
    const sold = snapshot.channelPreset;
    return [
      this.prisma.categoryChannel.deleteMany({ where: { categoryId: snapshot.id } }),
      ...(sold.length === 0
        ? []
        : [
            this.prisma.categoryChannel.createMany({
              data: sold.map((channel) => ({
                categoryId: snapshot.id,
                locationId: channel.locationId,
                contextKey: channel.context,
              })),
            }),
          ]),
    ];
  }

  async countActiveChildren(parentId: string): Promise<number> {
    return this.prisma.category.count({ where: { parentId, isArchived: false } });
  }

  async nextPosition(parentId: string | null): Promise<number> {
    const last = await this.prisma.category.findFirst({
      where: { parentId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    return last === null ? 0 : last.position + 1;
  }
}

/**
 * Traduit les violations d'unicité en refus métier.
 *
 * Les deux contraintes vivent en SQL (cf. la migration
 * `20260826090000_unicite_slug_rang_emplacement`) parce qu'aucune n'est
 * exprimable dans le schéma Prisma : l'une porte sur une **expression**
 * (`slug->>'fr'`, la colonne est un `Json` localisé), l'autre est **partielle**
 * et `NULLS NOT DISTINCT`.
 *
 * On les distingue : l'une se corrige en changeant de nom, l'autre en
 * recommençant. Les confondre ferait dire à l'écran « ce nom est pris » à
 * quelqu'un dont le nom est libre.
 */
async function guard<T>(snapshot: CategorySnapshot, write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    const constraint = violatedConstraint(error);
    if (constraint === "category_slug_fr_unique") {
      throw new CategorySlugTakenError(snapshot.slug.fr);
    }
    if (constraint === "category_sibling_rank_unique") {
      throw new CategoryRankTakenError(snapshot.parentId);
    }
    throw error;
  }
}
