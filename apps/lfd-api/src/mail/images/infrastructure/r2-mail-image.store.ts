import { Injectable, Logger } from "@nestjs/common";
import { contentAddressedKey, type S3StorageConfig, S3StorageService } from "@lfd/storage";

import { AppConfig } from "../../../platform/config/app-config.js";
import { assertOutsideTransaction } from "../../../platform/database/outside-transaction.js";
import { MailImageStorageUnavailableError } from "../domain/errors/mail-image.errors.js";
import { type MailImageCopy, MailImageStore } from "../domain/ports/mail-image.store.js";

/** Une image adressée par son contenu ne change jamais sous sa clé. */
const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";

/**
 * Le dossier du bloc dans le bucket des médias : tout ce que le mailer écrit
 * est dessous, et seulement là (Hugo, 2026-11-08).
 */
export const MAIL_COPIES_ROOT = "mail";

/** Le préfixe des clés : le dossier du bloc, puis l'usage (adressage par contenu). */
const KEY_PREFIX = `${MAIL_COPIES_ROOT}/templates`;

/** Ce que l'adaptateur demande au bucket — l'écriture, rien d'autre. */
export interface MailImageBucket {
  upload(key: string, body: Buffer, contentType: string, cacheControl: string): Promise<void>;
}

/** Les variables du bucket des médias, dans l'ordre où on les pose. */
const MEDIA_VARIABLES =
  "R2_MEDIA_BUCKET / R2_MEDIA_ACCESS_KEY_ID / R2_MEDIA_SECRET_ACCESS_KEY / R2_MEDIA_PUBLIC_BASE_URL";

/**
 * Le refus, dit avec ce qui manque vraiment. « Rien de posé » et « à moitié
 * posé » sont deux cas : le premier est un provisionnement à faire, le second
 * presque toujours une faute de frappe.
 */
function missingMediaReason(
  state: { readonly config: unknown; readonly missing: readonly string[] },
  baseUrl: string | null,
): string {
  const nothingPosed = state.config === null && state.missing.length === 0 && baseUrl === null;
  const names = [...state.missing, ...(baseUrl === null ? ["R2_MEDIA_PUBLIC_BASE_URL"] : [])];
  if (nothingPosed || names.length === 0) {
    return `Les images d'e-mail se rangent dans le bucket des médias, qui n'est pas configuré (${MEDIA_VARIABLES}).`;
  }
  return `Les images d'e-mail se rangent dans le bucket des médias, configuré à moitié — il manque ${names.join(", ")}.`;
}

/**
 * Adaptateur **R2** du stockage public des images d'e-mail : le bucket des
 * médias, sous `mail/` — par construction, comme la source (Hugo, 2026-11-08 ;
 * § 24 du plan du service d'e-mails ; modèle : `R2MediaStore`).
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
        "Le stockage des images d'e-mail a refusé le dépôt : réessayer, puis vérifier le bucket R2_MEDIA_BUCKET.",
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
    const state = this.config.r2StorageState("media");
    const baseUrl = this.config.mediaPublicBaseUrl();
    if (state.config === null || baseUrl === null) {
      throw new MailImageStorageUnavailableError(missingMediaReason(state, baseUrl));
    }
    this.cached = { bucket: this.openBucket(state.config), baseUrl };
    return this.cached;
  }
}
