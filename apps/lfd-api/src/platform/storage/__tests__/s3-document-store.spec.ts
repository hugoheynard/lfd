import { DocumentStorageUnavailableError } from "../../shared/errors/storage-errors.js";
import type { S3StorageConfig } from "@lfd/storage";
import { AppConfig } from "../../config/app-config.js";
import { S3DocumentStore } from "../s3-document-store.js";

/**
 * Un `AppConfig` doublé : seule `r2Storage` compte ici, et c'est elle qui décide
 * si l'adaptateur a de quoi parler à R2.
 *
 * Une **sous-classe** et non un objet greffé sur le prototype : `Object.create`
 * rend `any`, ce que le lint refuse à juste titre — un double qui ment sur son
 * type ne vérifie plus rien. Le vrai constructeur tourne (l'environnement de
 * test fournit ce qu'il exige), seule la lecture du stockage est remplacée.
 */
class FakeConfig extends AppConfig {
  constructor(private readonly storage: S3StorageConfig | null) {
    super();
  }

  override r2Storage(): S3StorageConfig | null {
    return this.storage;
  }
}

function configWith(storage: S3StorageConfig | null): AppConfig {
  return new FakeConfig(storage);
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
