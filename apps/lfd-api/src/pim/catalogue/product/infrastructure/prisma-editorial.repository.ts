import { Injectable } from "@nestjs/common";

import { Prisma } from "../../../../platform/database/client/client.js";
import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { EditorialRepository } from "../domain/ports/editorial.repository.js";
import type { Editorial, MediaItem } from "../domain/value-objects/editorial.js";
import type { LocalizedText } from "../../shared/domain/value-objects/localized-text.js";
import { localizedColumn } from "../../shared/infrastructure/json-readers.js";
import { MediaNotInLibraryError } from "../../shared/domain/value-objects/media.js";
import { SOURCE_LOCALE } from "../../shared/domain/value-objects/localized-text.js";

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
  constructor(private readonly prisma: PimPrismaService) {
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
   * L'identifiant de l'actif qui porte CES octets — retrouvé, ou inscrit.
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
    await this.correct(known.id, item);
    return known.id;
  }

  /**
   * Ce que la fiche corrige encore sur l'image — et seulement ce qu'elle dit
   * vraiment.
   *
   * ⚠️ **Écrire l'alternative sans condition l'effacerait.** `mediaItems`
   * remplit le champ manquant avec l'URL (« la colonne est obligatoire, une
   * chaîne vide passerait pour une alternative rédigée ») : une fiche qui n'en
   * porte pas envoie donc son URL, et l'écrire remplacerait une phrase humaine
   * par `https://…`. D'où le même critère que la migration de fusion — on
   * n'écrit que ce qui DIFFÈRE de l'URL.
   *
   * ⚠️ État TRANSITOIRE. L'étiquette et l'alternative appartiennent à la
   * bibliothèque (« un seul point », Hugo 2026-09-23) ; la fiche ne devrait pas
   * les écrire. Elles quitteront son panneau au même passage que le
   * déménagement du bloc.
   */
  private async correct(mediaId: string, item: MediaItem): Promise<void> {
    const data: { name?: string; alt?: Record<string, string> } = {};
    if (item.name !== "") {
      data.name = item.name;
    }
    if (item.alt[SOURCE_LOCALE] !== item.url) {
      data.alt = localizedColumn(item.alt);
    }
    if (Object.keys(data).length === 0) {
      return;
    }
    await this.prisma.mediaAsset.update({ where: { id: mediaId }, data });
  }
}
