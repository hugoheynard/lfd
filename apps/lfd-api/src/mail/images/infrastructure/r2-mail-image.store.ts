import { Injectable, Logger } from "@nestjs/common";
import { contentAddressedKey, type S3StorageConfig, S3StorageService } from "@lfd/storage";

import { AppConfig } from "../../../platform/config/app-config.js";
import { MAIL_PUBLIC_BASE_URL_VARIABLE } from "../../../platform/config/mail-image-readers.js";
import { assertOutsideTransaction } from "../../../platform/database/outside-transaction.js";
import { MailImageStorageUnavailableError } from "../domain/errors/mail-image.errors.js";
import { type MailImageCopy, MailImageStore } from "../domain/ports/mail-image.store.js";

/** Une image adressée par son contenu ne change jamais sous sa clé. */
const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";

/** Le préfixe des clés : l'usage, pas un propriétaire (adressage par contenu). */
const KEY_PREFIX = "templates";

/** Ce que l'adaptateur demande au bucket — l'écriture, rien d'autre. */
export interface MailImageBucket {
  upload(key: string, body: Buffer, contentType: string, cacheControl: string): Promise<void>;
}

/**
 * Le refus, dit avec ce qui manque vraiment. « Rien de posé » et « à moitié
 * posé » sont deux cas : le premier est un provisionnement à faire, le second
 * presque toujours une faute de frappe.
 */
function missingMailReason(
  state: { readonly config: unknown; readonly missing: readonly string[] },
  baseUrl: string | null,
): string {
  const nothingPosed = state.config === null && state.missing.length === 0 && baseUrl === null;
  const names = [...state.missing, ...(baseUrl === null ? [MAIL_PUBLIC_BASE_URL_VARIABLE] : [])];
  if (nothingPosed || names.length === 0) {
    return `Le stockage des images d'e-mail n'est pas configuré (R2_MAIL_BUCKET / R2_MAIL_ACCESS_KEY_ID / R2_MAIL_SECRET_ACCESS_KEY / ${MAIL_PUBLIC_BASE_URL_VARIABLE}).`;
  }
  return `Le stockage des images d'e-mail est configuré à moitié — il manque ${names.join(", ")}.`;
}

/**
 * Adaptateur **R2** du stockage public des images d'e-mail, sur l'usage `mail`
 * (§ 24 du plan du service d'e-mails ; modèle : `R2MediaStore`).
 *
 * Construit à la première copie, et seulement si le bucket ET son adresse
 * publique sont posés : sans l'adresse, on rangerait des images que personne
 * ne lirait. L'app démarre sans ; seule la copie refuse, en nommant ce qui
 * manque.
 */
@Injectable()
export class R2MailImageStore extends MailImageStore {
  private readonly logger = new Logger(R2MailImageStore.name);
  private cached: { bucket: MailImageBucket; baseUrl: string } | null = null;

  constructor(private readonly config: AppConfig) {
    super();
  }

  async put(bytes: Buffer, contentType: string): Promise<MailImageCopy> {
    assertOutsideTransaction("R2.mail.put");
    const { bucket, baseUrl } = this.channel();
    const key = contentAddressedKey(KEY_PREFIX, bytes, contentType);
    if (key === null) {
      // Le type a été vérifié en amont : arriver ici est un désaccord entre la
      // liste des types admis et la table d'extensions de `@lfd/storage`.
      throw new MailImageStorageUnavailableError(
        `Aucune extension connue pour « ${contentType} » — la liste des types d'image admis et la table d'extensions ont divergé.`,
      );
    }
    try {
      await bucket.upload(key, bytes, contentType, IMMUTABLE_CACHE);
    } catch (error) {
      const cause = error instanceof Error ? error.name : String(error);
      this.logger.error(`Stockage des images d'e-mail — dépôt de « ${key} » refusé : ${cause}`);
      throw new MailImageStorageUnavailableError(
        "Le stockage des images d'e-mail a refusé le dépôt : réessayer, puis vérifier le bucket R2_MAIL_BUCKET.",
        error,
      );
    }
    return { url: `${baseUrl}/${key}` };
  }

  /** Le client du bucket ; une sous-classe de test le remplace. */
  protected openBucket(config: S3StorageConfig): MailImageBucket {
    return new S3StorageService(config);
  }

  private channel(): { bucket: MailImageBucket; baseUrl: string } {
    if (this.cached !== null) {
      return this.cached;
    }
    const state = this.config.r2StorageState("mail");
    const baseUrl = this.config.mailPublicBaseUrl();
    if (state.config === null || baseUrl === null) {
      throw new MailImageStorageUnavailableError(missingMailReason(state, baseUrl));
    }
    this.cached = { bucket: this.openBucket(state.config), baseUrl };
    return this.cached;
  }
}
