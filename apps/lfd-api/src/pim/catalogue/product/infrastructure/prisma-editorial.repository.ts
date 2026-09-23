import { Injectable } from "@nestjs/common";

import { Prisma } from "../../../../platform/database/client/client.js";
import { ImageCatalogue, UnknownImageError } from "../../../channels/media/image-catalogue.js";
import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { EditorialRepository } from "../domain/ports/editorial.repository.js";
import type { Editorial, MediaItem } from "../domain/value-objects/editorial.js";
import type { LocalizedText } from "../../shared/domain/value-objects/localized-text.js";
import { localizedColumn } from "../../shared/infrastructure/json-readers.js";

/**
 * Un champ vidé doit **effacer** la colonne, pas la laisser telle quelle : d'où
 * `Prisma.DbNull` plutôt qu'une clé omise (qui, en `update`, ne changerait rien).
 * On n'écrit jamais `{ fr: "" }` — le vide n'est pas une valeur.
 */
function optionalColumn(
  text: LocalizedText | undefined,
): Record<string, string> | typeof Prisma.DbNull {
  return text === undefined ? Prisma.DbNull : localizedColumn(text);
}

@Injectable()
export class PrismaEditorialRepository extends EditorialRepository {
  constructor(
    private readonly prisma: PimPrismaService,
    // 🔴 La bibliothèque répond par un PORT : le référentiel ne lit plus sa
    // table. Il lui demande une référence opaque et la range, exactement comme
    // une ligne de commande B2B range un SKU du référentiel.
    private readonly images: ImageCatalogue,
  ) {
    super();
  }

  async save(productId: string, editorial: Editorial, media: readonly MediaItem[]): Promise<void> {
    const data = {
      descriptionShort: optionalColumn(editorial.descriptionShort),
      descriptionLong: optionalColumn(editorial.descriptionLong),
      story: optionalColumn(editorial.story),
      pairing: optionalColumn(editorial.pairing),
      brand: editorial.brand ?? null,
      seoTitle: optionalColumn(editorial.seoTitle),
      seoDescription: optionalColumn(editorial.seoDescription),
    };

    await this.prisma.productEditorial.upsert({
      where: { productId },
      create: { productId, ...data },
      update: data,
    });

    await this.attach(productId, media);
  }

  /**
   * Remplace les visuels : on détache tout, puis on rattache la liste reçue.
   *
   * Les `MediaAsset` détachés ne sont **pas** supprimés — un visuel peut servir
   * plusieurs produits, et une suppression en cascade retirerait l'image d'une
   * fiche voisine. Ils deviennent orphelins ; les ramasser est le travail d'un
   * nettoyage périodique, à écrire le jour où les images sont vraiment
   * téléversées plutôt que saisies par URL.
   */
  async replaceMedia(productId: string, media: readonly MediaItem[]): Promise<void> {
    await this.prisma.productMedia.deleteMany({ where: { productId } });
    await this.attach(productId, media);
  }

  /**
   * Crée l'actif puis son lien, dans l'ordre reçu.
   *
   * Une ligne par lien, et non une ligne partagée : le `alt` appartient à la
   * FICHE (c'est ainsi que CE produit décrit l'image), et partager la ligne
   * ferait qu'en corriger un changerait silencieusement l'autre. La
   * déduplication qui compte se fait dans le bucket, par l'adressage par
   * contenu — les mêmes octets ne sont stockés qu'une fois.
   *
   * Les faits techniques, eux, sont **relus** depuis l'inscription faite au
   * dépôt plutôt que renvoyés par le navigateur : le serveur les a mesurés dans
   * les octets, il n'a aucune raison de les redemander à un écran.
   */
  private async attach(productId: string, media: readonly MediaItem[]): Promise<void> {
    for (const item of media) {
      const mediaId = await this.assetFor(item);
      await this.prisma.productMedia.create({
        data: {
          mediaUrl: item.url,
          productId,
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
   * 🔴 **Il n'en existe plus qu'UN par URL** (contrainte d'unicité posée le
   * 2026-09-23). Auparavant, ce code créait un actif NEUF à chaque
   * enregistrement de fiche : la table était un journal de lignes, aucune
   * identité ne traversait deux sauvegardes, et c'est pourquoi la lecture de la
   * bibliothèque doit encore grouper par URL.
   *
   * L'inscription à la volée reste ici parce que le visuel saisi **par son
   * URL** est encore permis par l'API. Elle disparaîtra avec lui
   * (`documentation/mediatheque/plan-la-mediatheque-bloc-a-part.md` §2), et
   * c'est ce départ-là qui libérera le déménagement : tant que le référentiel
   * peut inscrire, il ÉCRIT la bibliothèque, et la porte de propriété lui en
   * donne la charge.
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
