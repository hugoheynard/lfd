import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
  type ObjectIdentifier,
} from "@aws-sdk/client-s3";

import type { S3StorageConfig } from "@lfd/storage";

/**
 * **Vide les buckets d'un poste de développement.**
 *
 * ## Pourquoi ça existe
 *
 * Le rechargement du jeu de données supprime les commandes ; il ne touchait pas
 * le stockage. Les bons de commande déjà tirés restaient donc en magasin, sous
 * des clés `orders/{orderId}/…` dont plus aucun identifiant n'existait — des
 * orphelins qu'aucun écran ne montre et que personne ne pense à nettoyer.
 *
 * Pire pour une démonstration : un bon **archivé** est rendu tel quel au
 * téléchargement suivant. Un poste qui garde les archives d'un jeu de données
 * effacé sert un vieux dessin sur une commande neuve, et on cherche le défaut
 * dans le rendu.
 *
 * ## La serrure, et pourquoi elle est ici
 *
 * ⚠️ **Ce module refuse tout point de terminaison qui n'est pas en boucle
 * locale.** C'est la serrure la plus basse qu'on puisse poser : elle rend le
 * geste **inexprimable** contre R2 plutôt que simplement interdit — même appelé
 * depuis un chemin qui aurait perdu ses autres gardes, il ne peut pas atteindre
 * un bucket distant.
 *
 * C'est la hiérarchie qu'on applique partout : inexprimable avant refusé.
 * Vider un bucket de production retirerait à des clients le seul document
 * qu'ils peuvent nous opposer.
 *
 * Le lecteur d'environnement n'est pas touché : les réglages arrivent **résolus**
 * par l'appelant, qui seul a le droit de lire `process.env`.
 */

/** Les hôtes où un stockage est celui de la machine, et de personne d'autre. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Ce que le nettoyage a emporté, bucket par bucket. */
export interface StorageResetReport {
  /** Le nom du bucket, pour que le compte rendu nomme ce qu'il a vidé. */
  readonly bucket: string;
  readonly objects: number;
}

/**
 * Refuse un stockage distant, et **rend le point de terminaison vérifié**.
 *
 * Il le rend plutôt que de le laisser relire : ainsi l'appelant ne peut pas
 * construire son client à partir d'une valeur que la serrure n'a pas vue.
 */
function localEndpointOf(config: S3StorageConfig): string {
  const endpoint = config.endpoint ?? "";
  if (endpoint === "") {
    throw new Error(
      "Stockage sans point de terminaison explicite : refusé. Un défaut de " +
        "configuration désignerait R2, et ce module vide des buckets.",
    );
  }
  const host = new URL(endpoint).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Stockage refusé (hôte « ${host} ») : ce module VIDE des buckets, et ne ` +
        `s'adresse qu'au MinIO d'un poste.`,
    );
  }
  return endpoint;
}

/**
 * Vide un bucket, page par page.
 *
 * `DeleteObjects` accepte mille clés par appel ; un poste n'en aura jamais
 * autant, mais une boucle qui suppose « ça tient en une page » finit toujours
 * par rencontrer la page suivante.
 */
export async function clearBucket(config: S3StorageConfig): Promise<StorageResetReport> {
  const endpoint = localEndpointOf(config);
  const client = new S3Client({
    // `auto` par défaut : `exactOptionalPropertyTypes` refuse un `undefined`
    // explicite, et une région absente n'a pas de sens pour le client S3.
    region: config.region ?? "auto",
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });

  let removed = 0;
  let token: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: config.bucket,
        ...(token === undefined ? {} : { ContinuationToken: token }),
      }),
    );
    const keys: ObjectIdentifier[] = (page.Contents ?? [])
      .filter((object) => object.Key !== undefined)
      .map((object) => ({ Key: object.Key }));
    if (keys.length > 0) {
      await client.send(
        new DeleteObjectsCommand({ Bucket: config.bucket, Delete: { Objects: keys } }),
      );
      removed += keys.length;
    }
    token = page.NextContinuationToken;
  } while (token !== undefined);

  return { bucket: config.bucket, objects: removed };
}

/**
 * Vide les buckets qu'un rechargement doit emporter.
 *
 * Un usage **non configuré** est ignoré en silence : sur un poste, tous ne le
 * sont pas, et refuser le rechargement entier parce qu'un bucket facultatif
 * manque serait disproportionné. Le compte rendu ne le nomme simplement pas.
 *
 * ⚠️ `kbis` et `media` n'y sont PAS, et ce n'est pas un oubli : le rechargement
 * ne supprime ni les pièces qu'un client nous a remises, ni les visuels du
 * catalogue — deux choses qu'aucun semis ne repose, et dont la perte se paierait
 * en re-dépôts manuels.
 */
export async function clearSeededBuckets(
  configs: readonly (S3StorageConfig | null)[],
): Promise<readonly StorageResetReport[]> {
  const reports: StorageResetReport[] = [];
  for (const config of configs) {
    if (config !== null) {
      reports.push(await clearBucket(config));
    }
  }
  return reports;
}
