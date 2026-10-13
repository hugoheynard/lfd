/**
 * Ce que les outils du préfixe universel tirent de l'extérieur : la base, le
 * bucket, l'environnement. Les dépendances (`pg`, `@aws-sdk/client-s3`) sont
 * celles de l'API, résolues depuis son `package.json` — `dev-toolbox/` n'a pas
 * de `node_modules`.
 *
 * 🔴 Aucune valeur par défaut : la base et le bucket se désignent EXPLICITEMENT
 * dans l'environnement du shell, jamais lus dans un `.env`. Un outil qui
 * retomberait sur la base de dev quand on croit viser la production — ou
 * l'inverse — est le pire des deux mondes.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const requireFromApi = createRequire(join(ROOT, "apps/lfd-api/package.json"));

/** Lit une variable obligatoire, ou s'arrête en la nommant. */
export function required(name) {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    console.error(`✗ ${name} n'est pas posée dans l'environnement — rien n'a été fait.`);
    process.exit(2);
  }
  return value.trim();
}

/** Une connexion à la base désignée par `MEDIA_PREFIX_DATABASE_URL`. */
export async function connectDatabase() {
  const { Client } = requireFromApi("pg");
  const client = new Client({ connectionString: required("MEDIA_PREFIX_DATABASE_URL") });
  await client.connect();
  return client;
}

/** Le bucket média désigné par les variables `R2_*` de l'API. */
export function mediaBucket() {
  const s3 = requireFromApi("@aws-sdk/client-s3");
  const client = new s3.S3Client({
    region: process.env["R2_REGION"] ?? "auto",
    endpoint: required("R2_ENDPOINT"),
    forcePathStyle: true,
    credentials: {
      accessKeyId: required("R2_MEDIA_ACCESS_KEY_ID"),
      secretAccessKey: required("R2_MEDIA_SECRET_ACCESS_KEY"),
    },
  });
  const bucket = required("R2_MEDIA_BUCKET");
  return {
    bucket,
    /** `{ etag, contentType, cacheControl }`, ou `null` si l'objet n'existe pas. */
    async head(key) {
      try {
        const out = await client.send(new s3.HeadObjectCommand({ Bucket: bucket, Key: key }));
        return {
          etag: out.ETag ?? "",
          contentType: out.ContentType ?? null,
          cacheControl: out.CacheControl ?? null,
        };
      } catch (error) {
        if (error?.$metadata?.httpStatusCode === 404 || error?.name === "NotFound") {
          return null;
        }
        throw error;
      }
    },
    /** Copie côté serveur, en reposant explicitement type et cache. */
    async copy(source, target, head) {
      await client.send(
        new s3.CopyObjectCommand({
          Bucket: bucket,
          Key: target,
          CopySource: `${bucket}/${source}`,
          MetadataDirective: "REPLACE",
          ...(head.contentType === null ? {} : { ContentType: head.contentType }),
          ...(head.cacheControl === null ? {} : { CacheControl: head.cacheControl }),
        }),
      );
    },
    /** Supprime UNE clé nommée — jamais un motif, jamais une liste du bucket. */
    async deleteOne(key) {
      await client.send(new s3.DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}

/** Le statut HTTP d'un `HEAD` public — `0` si le réseau a échoué. */
export async function publicStatus(url) {
  try {
    const response = await fetch(url, { method: "HEAD", redirect: "manual" });
    return response.status;
  } catch {
    return 0;
  }
}

export function datasourceText() {
  return readFileSync(join(ROOT, "apps/lfd-api/prisma/schema/datasource.prisma"), "utf8");
}

/** Lance `task` sur la liste, `width` à la fois — R2 n'aime pas mille appels d'un coup. */
export async function inBatches(items, width, task) {
  const results = [];
  for (let start = 0; start < items.length; start += width) {
    results.push(...(await Promise.all(items.slice(start, start + width).map(task))));
  }
  return results;
}
