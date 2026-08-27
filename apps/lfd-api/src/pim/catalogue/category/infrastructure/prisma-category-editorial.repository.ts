import { Injectable } from "@nestjs/common";

import { Prisma } from "../../../../platform/database/client/client.js";
import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { PimIdGenerator } from "../../../infra/id/pim-id-generator.js";
import type { LocalizedText } from "../../shared/domain/value-objects/localized-text.js";
import type { MediaItem } from "../../shared/domain/value-objects/media.js";
import { localizedColumn } from "../../shared/infrastructure/json-readers.js";
import { CategoryEditorialRepository } from "../domain/ports/category-editorial.repository.js";
import {
  isEmptyCategoryEditorial,
  type CategoryEditorial,
} from "../domain/value-objects/category-editorial.js";

/**
 * Un champ vidé doit **effacer** la colonne, pas la laisser telle quelle : d'où
 * `Prisma.DbNull` plutôt qu'une clé omise, qui en `update` ne changerait rien.
 * On n'écrit jamais `{ fr: "" }` — le vide n'est pas une valeur.
 */
function optionalColumn(
  text: LocalizedText | undefined,
): Record<string, string> | typeof Prisma.DbNull {
  return text === undefined ? Prisma.DbNull : localizedColumn(text);
}

@Injectable()
export class PrismaCategoryEditorialRepository extends CategoryEditorialRepository {
  constructor(
    private readonly prisma: PimPrismaService,
    private readonly ids: PimIdGenerator,
  ) {
    super();
  }

  /**
   * Écrit les textes — ou **efface la ligne** si plus rien n'est renseigné.
   *
   * Satellite optionnel (ADR-13) : « aucune description » doit être l'absence de
   * ligne, pas une ligne de quatre colonnes nulles. Sans cette suppression, la
   * première frappe créerait une ligne que rien n'effacerait jamais, et
   * `findByCategory` rendrait une vue pleine de `null` là où il doit rendre
   * `null` tout court — deux absences différentes pour la même réalité.
   */
  async saveTexts(categoryId: string, editorial: CategoryEditorial): Promise<void> {
    if (isEmptyCategoryEditorial(editorial)) {
      await this.prisma.categoryEditorial.deleteMany({ where: { categoryId } });
      return;
    }
    const data = {
      descriptionShort: optionalColumn(editorial.descriptionShort),
      descriptionLong: optionalColumn(editorial.descriptionLong),
      seoTitle: optionalColumn(editorial.seoTitle),
      seoDescription: optionalColumn(editorial.seoDescription),
    };
    await this.prisma.categoryEditorial.upsert({
      where: { categoryId },
      create: { categoryId, ...data },
      update: data,
    });
  }

  /**
   * Remplace les visuels : on détache tout, puis on rattache la liste reçue.
   *
   * Les `MediaAsset` détachés ne sont **pas** supprimés — un visuel peut servir
   * une autre famille ou une fiche, et une suppression en cascade retirerait
   * l'image sous elles. Ils deviennent orphelins, et c'est le ramassage
   * périodique qui tranche — lui seul voit TOUS les porteurs.
   */
  async replaceMedia(categoryId: string, media: readonly MediaItem[]): Promise<void> {
    await this.prisma.categoryMedia.deleteMany({ where: { categoryId } });
    for (const item of media) {
      const mediaId = this.ids.next();
      const facts = await this.factsFor(item.url);
      await this.prisma.mediaAsset.create({
        data: {
          id: mediaId,
          url: item.url,
          name: item.name,
          alt: localizedColumn(item.alt),
          ...facts,
        },
      });
      await this.prisma.categoryMedia.create({
        data: { categoryId, mediaId, role: item.role, position: item.position },
      });
    }
  }

  /**
   * Ce qu'on sait déjà de cette URL, ou des colonnes vides.
   *
   * Relu depuis l'inscription faite au DÉPÔT plutôt que renvoyé par le
   * navigateur : le serveur a mesuré ces octets, il n'a pas à redemander leur
   * taille à un écran qui pourrait en dire autre chose.
   */
  private async factsFor(url: string): Promise<{
    storageKey: string | null;
    contentType: string | null;
    width: number | null;
    height: number | null;
    bytes: number | null;
  }> {
    const known = await this.prisma.mediaAsset.findFirst({
      where: { url, storageKey: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { storageKey: true, contentType: true, width: true, height: true, bytes: true },
    });
    return known ?? { storageKey: null, contentType: null, width: null, height: null, bytes: null };
  }
}
