import { Injectable } from "@nestjs/common";

import { Prisma } from "../../../../platform/database/client/client.js";
import { ImageCatalogue, UnknownImageError } from "../../../channels/media/image-catalogue.js";
import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
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
    // 🔴 La bibliothèque répond par un PORT : le référentiel ne lit plus sa
    // table. Il lui demande une référence opaque et la range, exactement comme
    // une ligne de commande B2B range un SKU du référentiel.
    private readonly images: ImageCatalogue,
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
      const mediaId = await this.assetFor(item);
      await this.prisma.categoryMedia.create({
        data: {
          mediaUrl: item.url,
          categoryId,
          mediaId,
          role: item.role,
          position: item.position,
        },
      });
    }
  }

  /**
   * La **référence opaque** de l'image, obtenue de la bibliothèque.
   *
   * 🔴 Il n'en existe plus qu'UN par URL (contrainte d'unicité, 2026-09-23).
   * Même mécanique et mêmes raisons que la fiche produit
   * (`prisma-editorial.repository.ts`) : la table était un journal de lignes,
   * elle redevient une bibliothèque.
   */
  private async assetFor(item: MediaItem): Promise<string> {
    const reference = await this.images.reference(item.url);
    if (reference === null) {
      // 🔴 **Plus de visuel par simple URL** (Hugo, 2026-09-23). C'était le
      // dernier chemin par lequel une image entrait sans passer par un dépôt.
      // Ce qu'on perd : illustrer depuis une banque d'images distante sans
      // copier l'octet. Ce qu'on gagne : toute image du catalogue est chez
      // nous, mesurée, et ne disparaît pas parce qu'un tiers a rangé son
      // serveur.
      throw new UnknownImageError(item.url);
    }
    return reference;
  }
}
