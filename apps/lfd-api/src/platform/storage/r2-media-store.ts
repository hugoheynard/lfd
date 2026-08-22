import { Injectable, Logger } from "@nestjs/common";
import { contentAddressedKey, S3StorageService } from "@lfd/storage";

import { MediaStorageUnavailableError } from "../shared/errors/storage-errors.js";
import { AppConfig } from "../config/app-config.js";
import { MediaStore, type PublicAsset, type StoredAsset } from "./media-store.js";

/**
 * Le refus, dit avec ce qui manque VRAIMENT.
 *
 * « Le stockage n'est pas configuré » est faux et trompeur quand trois valeurs
 * sur quatre sont posées : ça envoie chercher un branchement absent là où il y
 * a une faute de frappe.
 */
function missingMediaReason(missing: readonly string[], baseUrl: string | null): string {
  const names = [...missing, ...(baseUrl === null ? ["R2_MEDIA_PUBLIC_BASE_URL"] : [])];
  if (names.length === 0) {
    return "Le stockage des médias n'est pas configuré (R2_MEDIA_BUCKET / R2_MEDIA_ACCESS_KEY_ID / R2_MEDIA_SECRET_ACCESS_KEY / R2_MEDIA_PUBLIC_BASE_URL).";
  }
  return `Le stockage des médias est configuré à moitié — il manque ${names.join(", ")}.`;
}

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

  async remove(storageKey: string): Promise<void> {
    const { service } = this.channel();
    try {
      await service.delete(storageKey);
    } catch (error) {
      const cause = error instanceof Error ? error.name : String(error);
      this.logger.error(`Stockage média — suppression de « ${storageKey} » refusée : ${cause}`);
      throw new MediaStorageUnavailableError(
        "Le stockage des médias a refusé la suppression.",
        error,
      );
    }
  }

  private channel(): { service: S3StorageService; baseUrl: string } {
    if (this.cached !== null) {
      return this.cached;
    }
    const state = this.config.r2StorageState("media");
    const baseUrl = this.config.mediaPublicBaseUrl();
    if (state.config === null || baseUrl === null) {
      throw new MediaStorageUnavailableError(missingMediaReason(state.missing, baseUrl));
    }
    this.cached = { service: new S3StorageService(state.config), baseUrl };
    return this.cached;
  }
}
