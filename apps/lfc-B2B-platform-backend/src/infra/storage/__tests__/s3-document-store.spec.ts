import { DocumentStorageUnavailableError } from "../../../shared/errors/storage-errors.js";
import type { S3StorageConfig } from "@lfd/storage";
import { AppConfig } from "../../config/app-config.js";
import { S3DocumentStore } from "../s3-document-store.js";

/**
 * Un `AppConfig` doublé : seule `r2Storage` compte ici, et c'est elle qui décide
 * si l'adaptateur a de quoi parler à R2.
 */
function configWith(storage: S3StorageConfig | null): AppConfig {
  const stub: Pick<AppConfig, "r2Storage"> = { r2Storage: () => storage };
  return Object.assign(Object.create(AppConfig.prototype), stub);
}

const CONFIGURED: S3StorageConfig = {
  bucket: "lfc-b2b-kbis",
  accessKeyId: "clé",
  secretAccessKey: "secret",
  endpoint: "https://compte.r2.cloudflarestorage.com",
  region: "auto",
};

/** Une erreur telle que le SDK S3 en lève : le NOM porte le diagnostic. */
function s3Error(name: string): Error {
  const error = new Error("The specified bucket does not exist");
  error.name = name;
  return error;
}

describe("S3DocumentStore — le canal absent", () => {
  it("REFUSE clairement quand rien n'est configuré", async () => {
    const store = new S3DocumentStore(configWith(null));

    await expect(
      store.save("companies/1/kbis", { bytes: Buffer.from("x"), contentType: "application/pdf" }),
    ).rejects.toBeInstanceOf(DocumentStorageUnavailableError);
  });

  it("nomme les variables manquantes, pour qu'on sache quoi poser", async () => {
    const store = new S3DocumentStore(configWith(null));

    await expect(store.read("companies/1/kbis")).rejects.toThrow(/R2_KBIS_BUCKET/);
  });
});

describe("S3DocumentStore — le canal en ÉCHEC", () => {
  /**
   * Le cas qui a coûté une soirée : le stockage est configuré, R2 répond, et il
   * refuse. L'erreur du SDK remontait telle quelle jusqu'au filtre, qui la
   * rendait en `internal.unexpected` — indiscernable d'un bug, alors que c'est
   * une panne ordinaire du canal avec un nom précis (`NoSuchBucket`).
   */
  function storeThatFails(name: string): S3DocumentStore {
    const store = new S3DocumentStore(configWith(CONFIGURED));
    Reflect.set(store, "cached", {
      upload: () => Promise.reject(s3Error(name)),
      downloadToBuffer: () => Promise.reject(s3Error(name)),
    });
    return store;
  }

  it.each(["NoSuchBucket", "InvalidAccessKeyId", "SignatureDoesNotMatch"])(
    "catégorise %s en panne de stockage, jamais en erreur inattendue",
    async (name) => {
      await expect(
        storeThatFails(name).save("companies/1/kbis", {
          bytes: Buffer.from("x"),
          contentType: "application/pdf",
        }),
      ).rejects.toBeInstanceOf(DocumentStorageUnavailableError);
    },
  );

  it("garde la cause d'origine attachée, pour le journal", async () => {
    const failure = storeThatFails("NoSuchBucket").read("companies/1/kbis");

    await expect(failure).rejects.toMatchObject({ cause: { name: "NoSuchBucket" } });
  });

  it("ne renvoie PAS le nom du bucket au client", async () => {
    // Cette surface sert aussi les clients : le nom de nos buckets et celui de
    // l'erreur AWS restent au journal.
    await expect(storeThatFails("NoSuchBucket").read("companies/1/kbis")).rejects.not.toThrow(
      /lfc-b2b-kbis|NoSuchBucket/,
    );
  });
});
