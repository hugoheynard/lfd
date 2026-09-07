/**
 * Le **stockage objet des e2e** : un vrai MinIO, pas un magasin en mémoire.
 *
 * Les trois suites qui déposent une pièce (KBIS client, KBIS staff, mandat
 * signé) doublaient `DocumentStore` par une `Map`. C'était commode et ça ne
 * prouvait rien : ni que le SDK est correctement configuré, ni qu'une clé
 * composée avec un `/` range vraiment sous ce préfixe, ni que relire une pièce
 * après l'avoir déposée rend les mêmes octets. Le seul bout de la chaîne qui
 * n'était jamais exécuté était précisément celui qui casse en ligne.
 *
 * MinIO parle S3 comme R2 : le service applicatif est utilisé **tel quel**, et
 * seul l'endpoint change (cf. `docker-compose.dev.yml`). Ce fichier n'expose que
 * ce dont les suites ont besoin — préparer les buckets, les vider entre deux
 * tests, et dire ce qu'ils contiennent.
 *
 * **Un bucket par usage**, comme en production : `storageKeys("customers")` ne
 * voit pas ce que `storageKeys()` voit. C'est ce qui fait qu'un e2e ne peut pas
 * passer sur un montage où les deux se confondraient.
 */
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { testStorageConfig, type TestStorageUsage } from "./setup-env.js";

const config = testStorageConfig();

/** Client de **contrôle** — celui de l'app reste seul à écrire les pièces. */
const client = new S3Client({
  region: config.region,
  endpoint: config.endpoint,
  forcePathStyle: true,
  credentials: {
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  },
});

/**
 * Prépare le bucket, ou échoue **tôt et clairement**.
 *
 * Le bucket est créé ici plutôt que par le `docker-compose` : le harnais sait de
 * quoi il a besoin, et la CI n'a alors rien de plus à provisionner que le
 * conteneur lui-même. Sans ce garde-fou, une pièce déposée sans MinIO échouerait
 * sur une erreur AWS de bas niveau, et on chercherait le bug dans le domaine.
 */
export async function ensureTestBucket(): Promise<void> {
  for (const usage of USAGES) {
    await ensureOne(bucketOf(usage));
  }
}

/** Les usages, une fois — l'ordre n'a pas d'importance, la couverture si. */
const USAGES: readonly TestStorageUsage[] = ["kbis", "customers", "production"];

/** Le bucket d'un usage : c'est ce qui interdit qu'un jeton ouvre celui d'à côté. */
function bucketOf(usage: TestStorageUsage): string {
  return config.buckets[usage];
}

async function ensureOne(bucket: string): Promise<void> {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return;
  } catch {
    // Bucket absent (ou MinIO injoignable) : on tente de le créer, et c'est
    // cette tentative qui tranche entre les deux cas.
  }
  try {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  } catch (cause) {
    throw new Error(
      `Stockage objet de test indisponible (${config.endpoint}, bucket ${bucket}).\n` +
        `  pnpm dev:infra   (à la racine du monorepo — démarre Postgres ET MinIO)`,
      { cause },
    );
  }
}

/** Les clés présentes dans le bucket de test, triées — de quoi assurer dessus. */
export async function storageKeys(usage: TestStorageUsage = "kbis"): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: bucketOf(usage),
        ...(token !== undefined ? { ContinuationToken: token } : {}),
      }),
    );
    for (const object of page.Contents ?? []) {
      if (object.Key !== undefined) {
        keys.push(object.Key);
      }
    }
    token = page.NextContinuationToken;
  } while (token !== undefined);
  return keys.sort();
}

/**
 * Vide le bucket entre deux tests — le pendant du `TRUNCATE` de la base.
 *
 * Sans ça, une pièce déposée par un test resterait visible du suivant : c'est
 * exactement la fuite inter-tests que le `TRUNCATE` évite côté SQL.
 */
export async function resetStorage(): Promise<void> {
  for (const usage of USAGES) {
    await resetOne(usage);
  }
}

async function resetOne(usage: TestStorageUsage): Promise<void> {
  const keys = await storageKeys(usage);
  if (keys.length === 0) {
    return;
  }
  await client.send(
    new DeleteObjectsCommand({
      Bucket: bucketOf(usage),
      Delete: { Objects: keys.map((Key) => ({ Key })) },
    }),
  );
}

/**
 * Écrit des octets **par-dessus** une clé, avec le client de CONTRÔLE.
 *
 * Sert à prouver qu'une route relit l'archive au lieu de refabriquer : on
 * substitue un contenu reconnaissable, et on regarde ce qui est servi. Passer
 * par le port de l'application ne prouverait rien — c'est justement le chemin
 * qu'on veut mettre en défaut.
 */
export async function putStorageObject(
  usage: TestStorageUsage,
  key: string,
  bytes: Buffer,
): Promise<void> {
  await client.send(new PutObjectCommand({ Bucket: bucketOf(usage), Key: key, Body: bytes }));
}

/** Supprime une clé — pour éprouver ce que fait une route quand l'archive manque. */
export async function deleteStorageObject(usage: TestStorageUsage, key: string): Promise<void> {
  await client.send(new DeleteObjectCommand({ Bucket: bucketOf(usage), Key: key }));
}
