import { Injectable, Logger } from "@nestjs/common";
import { contentAddressedKey, S3StorageService } from "@lfd/storage";

import { MediaStorageUnavailableError } from "../shared/errors/storage-errors.js";
import { AppConfig } from "../config/app-config.js";
import { MediaStore, type PublicAsset, type StoredAsset } from "./media-store.js";

/**
 * Adaptateur **R2** du stockage des médias publics.
 *
 * Construit à la première image, et seulement si le bucket ET le domaine public
 * sont configurés — l'un sans l'autre ne sert à rien : on saurait écrire des
 * octets que personne ne pourrait lire, et on enregistrerait en base des URL
 * mortes. Une image sur une adresse morte est pire qu'un dépôt refusé, parce
 * qu'elle ne se voit qu'à l'affichage, longtemps après.
 *
 * Le reste de l'app démarre sans : seul le dépôt d'image est indisponible.
 */
@Injectable()
export class R2MediaStore extends MediaStore {
  private readonly logger = new Logger(R2MediaStore.name);
  private cached: { service: S3StorageService; baseUrl: string } | null = null;

  constructor(private readonly config: AppConfig) {
    super();
  }

  async put(prefix: string, asset: PublicAsset): Promise<StoredAsset> {
    const { service, baseUrl } = this.channel();
    const storageKey = contentAddressedKey(prefix, asset.bytes, asset.contentType);
    if (storageKey === null) {
      // Le type a déjà été validé en amont : arriver ici est un désaccord entre
      // la liste d'acceptation du domaine et la table d'extensions, pas une
      // erreur de l'utilisateur.
      throw new MediaStorageUnavailableError(
        `Aucune extension connue pour « ${asset.contentType} » — la liste d'acceptation et la table d'extensions ont divergé.`,
      );
    }
    try {
      await service.upload(storageKey, asset.bytes, asset.contentType);
    } catch (error) {
      const cause = error instanceof Error ? error.name : String(error);
      this.logger.error(`Stockage média — dépôt de « ${storageKey} » refusé : ${cause}`);
      throw new MediaStorageUnavailableError("Le stockage des médias a refusé le dépôt.", error);
    }
    return { storageKey, url: `${baseUrl}/${storageKey}` };
  }

  private channel(): { service: S3StorageService; baseUrl: string } {
    if (this.cached !== null) {
      return this.cached;
    }
    const config = this.config.r2Storage("media");
    const baseUrl = this.config.mediaPublicBaseUrl();
    if (config === null || baseUrl === null) {
      throw new MediaStorageUnavailableError(
        "Le stockage des médias n'est pas configuré (R2_MEDIA_BUCKET / R2_MEDIA_ACCESS_KEY_ID / R2_MEDIA_SECRET_ACCESS_KEY / R2_MEDIA_PUBLIC_BASE_URL).",
      );
    }
    this.cached = { service: new S3StorageService(config), baseUrl };
    return this.cached;
  }
}
