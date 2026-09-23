import { Injectable } from "@nestjs/common";

import { Prisma } from "../../../../platform/database/client/client.js";
import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import type { LocalizedText } from "../../shared/domain/value-objects/localized-text.js";
import type { MediaItem } from "../../shared/domain/value-objects/media.js";
import { localizedColumn } from "../../shared/infrastructure/json-readers.js";
import { MediaNotInLibraryError } from "../../shared/domain/value-objects/media.js";
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
  constructor(private readonly prisma: PimPrismaService) {
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
   * L'identifiant de l'actif qui porte CES octets — **retrouvé**, jamais écrit.
   *
   * 🔴 Il n'en existe plus qu'UN par URL (contrainte d'unicité, 2026-09-23).
   * Même mécanique et mêmes raisons que la fiche produit
   * (`prisma-editorial.repository.ts`) : la table était un journal de lignes,
   * elle redevient une bibliothèque.
   */
  private async assetFor(item: MediaItem): Promise<string> {
    const known = await this.prisma.mediaAsset.findUnique({
      where: { url: item.url },
      select: { id: true },
    });
    if (known === null) {
      // 🔴 **Plus de visuel par simple URL** (Hugo, 2026-09-23). C'était le
      // dernier chemin par lequel une image entrait sans passer par un dépôt,
      // donc le dernier qui obligeait le référentiel à INSCRIRE dans la
      // bibliothèque — et donc à en être propriétaire au sens de
      // `lint:prisma-model-ownership`. Le fermer est ce qui libère le
      // déménagement en bloc `media/`
      // (`documentation/mediatheque/plan-la-mediatheque-bloc-a-part.md` §2).
      //
      // Ce qu'on perd : illustrer depuis une banque d'images distante sans
      // copier l'octet. Ce qu'on gagne : toute image du catalogue est chez
      // nous, mesurée, et ne disparaît pas parce qu'un tiers a rangé son
      // serveur.
      throw new MediaNotInLibraryError(item.url);
    }
    return known.id;
  }
}
