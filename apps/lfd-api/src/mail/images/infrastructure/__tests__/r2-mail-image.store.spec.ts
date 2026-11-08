import type { S3StorageConfig } from "@lfd/storage";

import { AppConfig } from "../../../../platform/config/app-config.js";
import type { R2StorageState } from "../../../../platform/config/env-readers.js";
import { MailImageStorageUnavailableError } from "../../domain/errors/mail-image.errors.js";
import { type MailImageBucket, R2MailImageStore } from "../r2-mail-image.store.js";

const CONFIGURED: S3StorageConfig = {
  bucket: "lfc-mail",
  accessKeyId: "clé",
  secretAccessKey: "secret",
  endpoint: "https://compte.r2.cloudflarestorage.com",
  region: "auto",
};

/** Un `AppConfig` doublé par sous-classe : seuls l'usage `mail` et son adresse comptent. */
class FakeConfig extends AppConfig {
  constructor(
    private readonly state: R2StorageState,
    private readonly baseUrl: string | null,
  ) {
    super();
  }

  override r2StorageState(): R2StorageState {
    return this.state;
  }

  override mailPublicBaseUrl(): string | null {
    return this.baseUrl;
  }
}

interface Upload {
  readonly key: string;
  readonly contentType: string;
  readonly cacheControl: string;
}

/** L'adaptateur réel, dont seul le client du bucket est remplacé. */
class RecordingStore extends R2MailImageStore {
  readonly uploads: Upload[] = [];
  failWith: Error | null = null;

  protected override openBucket(): MailImageBucket {
    return {
      upload: (key, _body, contentType, cacheControl) => {
        if (this.failWith !== null) {
          return Promise.reject(this.failWith);
        }
        this.uploads.push({ key, contentType, cacheControl });
        return Promise.resolve();
      },
    };
  }
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7]);

function store(
  state: R2StorageState = { config: CONFIGURED, missing: [] },
  baseUrl: string | null = "https://mail-images.lafoliecoffee.info",
): RecordingStore {
  return new RecordingStore(new FakeConfig(state, baseUrl));
}

describe("R2MailImageStore — le stockage public des images d'e-mail", () => {
  it("range sous une clé tirée du contenu, servie immuable, et rend l'adresse publique", async () => {
    const subject = store();

    const { url } = await subject.put(PNG, "image/png");

    expect(url).toMatch(
      /^https:\/\/mail-images\.lafoliecoffee\.info\/mail\/templates\/[0-9a-f]{64}\.png$/,
    );
    expect(subject.uploads[0]).toMatchObject({
      contentType: "image/png",
      cacheControl: "public, max-age=31536000, immutable",
    });
  });

  it("la même image rangée deux fois a la même adresse", async () => {
    const subject = store();

    const first = await subject.put(PNG, "image/png");
    const second = await subject.put(Buffer.from(PNG), "image/png");

    expect(second.url).toBe(first.url);
  });

  it("n'a pas de verbe pour retirer une image publiée", () => {
    expect("delete" in store()).toBe(false);
    expect("remove" in store()).toBe(false);
  });

  it("rien de configuré : refuse en nommant les variables", async () => {
    await expect(store({ config: null, missing: [] }, null).put(PNG, "image/png")).rejects.toThrow(
      /R2_MAIL_BUCKET.*R2_MAIL_PUBLIC_BASE_URL/,
    );
  });

  it("bucket posé sans adresse publique : refuse en nommant l'adresse manquante", async () => {
    await expect(store(undefined, null).put(PNG, "image/png")).rejects.toThrow(
      /il manque R2_MAIL_PUBLIC_BASE_URL/,
    );
  });

  it("à moitié posé : nomme ce qui manque", async () => {
    await expect(
      store({ config: null, missing: ["R2_MAIL_SECRET_ACCESS_KEY"] }).put(PNG, "image/png"),
    ).rejects.toThrow(/il manque R2_MAIL_SECRET_ACCESS_KEY/);
  });

  it("un refus du bucket est une panne de stockage, pas une erreur inattendue", async () => {
    const subject = store();
    const error = new Error("The specified bucket does not exist");
    error.name = "NoSuchBucket";
    subject.failWith = error;

    await expect(subject.put(PNG, "image/png")).rejects.toBeInstanceOf(
      MailImageStorageUnavailableError,
    );
  });
});
