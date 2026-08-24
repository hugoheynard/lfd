import { Injectable } from "@nestjs/common";

import { Prisma } from "../../../../platform/database/client/client.js";
import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { PimIdGenerator } from "../../../infra/id/pim-id-generator.js";
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
    private readonly ids: PimIdGenerator,
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
      await this.prisma.productMedia.create({
        data: {
          productId,
          mediaId,
          role: item.role,
          position: item.position,
        },
      });
    }
  }

  /**
   * Ce qu'on sait déjà de cette URL, ou des colonnes vides.
   *
   * Vide est le cas normal d'un visuel saisi à la main : on n'héberge pas cet
   * octet, on ne l'a pas mesuré, et aller le télécharger pour le mesurer serait
   * une requête sortante par visuel à chaque enregistrement de fiche.
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
