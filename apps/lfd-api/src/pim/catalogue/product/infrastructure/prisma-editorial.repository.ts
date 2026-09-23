import { Injectable } from "@nestjs/common";

import { Prisma } from "../../../../platform/database/client/client.js";
import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { PimIdGenerator } from "../../../infra/id/pim-id-generator.js";
import { EditorialRepository } from "../domain/ports/editorial.repository.js";
import type { Editorial, MediaItem } from "../domain/value-objects/editorial.js";
import type { LocalizedText } from "../../shared/domain/value-objects/localized-text.js";
import { localizedColumn } from "../../shared/infrastructure/json-readers.js";
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
      const mediaId = this.ids.next();
      await this.prisma.mediaAsset.create({
        data: {
          id: mediaId,
          url: item.url,
          name: item.name,
          alt: localizedColumn(item.alt),
          ...(await this.factsFor(item.url)),
        },
      });
      return mediaId;
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

  /**
   * Ce qu'on sait déjà de cette URL, ou des colonnes vides.
   *
   * Vide est le cas normal d'un visuel saisi à la main : on n'héberge pas cet
   * octet, on ne l'a pas mesuré, et aller le télécharger pour le mesurer serait
   * une requête sortante par visuel à chaque enregistrement de fiche.
   *
   * 🔴 **DEUX lectures, et pas une**, parce que les deux familles de faits
   * n'ont pas la même condition d'existence :
   *
   * - ce qu'on a **mesuré** n'existe que pour ce qu'on héberge, d'où le
   *   `storageKey: { not: null }` ;
   * - le **point focal** et les **tags** sont des DÉCISIONS, et quelqu'un peut
   *   très bien les avoir prises sur une image saisie par son URL. Les chercher
   *   sous la même condition les aurait perdus précisément là.
   */
  private async factsFor(url: string): Promise<{
    storageKey: string | null;
    contentType: string | null;
    width: number | null;
    height: number | null;
    bytes: number | null;
    focalX: number | null;
    focalY: number | null;
    tags: string[];
  }> {
    const measured = await this.prisma.mediaAsset.findFirst({
      where: { url, storageKey: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { storageKey: true, contentType: true, width: true, height: true, bytes: true },
    });
    return {
      ...(measured ?? {
        storageKey: null,
        contentType: null,
        width: null,
        height: null,
        bytes: null,
      }),
      ...(await this.decidedFor(url)),
    };
  }

  /**
   * Le point focal déjà choisi pour ces octets, ou deux colonnes vides.
   *
   * 🔴 **Il doit être RELU et reporté, sinon il ne survit pas.**
   * {@link replaceMedia} détache tout puis recrée un `MediaAsset` NEUF par
   * visuel : un identifiant d'actif ne traverse pas un enregistrement de
   * section. Ce qui traverse, c'est l'URL — adressée par contenu, donc stable
   * pour des octets donnés. Sans ce report, le point serait effacé au premier
   * enregistrement suivant, c'est-à-dire qu'il marcherait à l'écran et
   * disparaîtrait ensuite.
   *
   * `null` veut dire « personne ne s'est prononcé », jamais « au centre » : le
   * centre est un choix comme un autre, et les confondre obligerait à deviner
   * lequel on lit.
   */
  private async decidedFor(
    url: string,
  ): Promise<{ focalX: number | null; focalY: number | null; tags: string[] }> {
    const [pointed, tagged] = await Promise.all([
      this.prisma.mediaAsset.findFirst({
        where: { url, focalX: { not: null } },
        orderBy: { createdAt: "desc" },
        select: { focalX: true, focalY: true },
      }),
      // Les TAGS se cherchent SÉPARÉMENT du point : une image peut être taguée
      // sans être pointée, et l'inverse. Les lire sur la même ligne ferait
      // perdre l'un des deux selon lequel a été décidé en dernier.
      this.prisma.mediaAsset.findFirst({
        where: { url, NOT: { tags: { isEmpty: true } } },
        orderBy: { createdAt: "desc" },
        select: { tags: true },
      }),
    ]);
    return { ...(pointed ?? { focalX: null, focalY: null }), tags: tagged?.tags ?? [] };
  }
}
