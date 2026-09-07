import { config as loadEnv } from "dotenv";

// 🔴 `dotenv/config` ne charge que `.env`, et les coordonnées de l'infra
// dockerisée vivent dans `.env.development` — VERSIONNÉ, pour qu'elles soient
// les mêmes sur tous les postes. Ce script disait donc « aucun bucket configuré »
// pendant que l'API, elle, en voyait deux : `envFilePaths()` charge les deux.
//
// L'ordre compte : `dotenv` ne réécrit pas une variable déjà posée, donc le
// `.env` d'un poste garde le dernier mot sur le fichier versionné.
loadEnv({ path: ".env" });
loadEnv({ path: ".env.development" });

import { PrismaPg } from "@prisma/adapter-pg";
import type { S3StorageConfig } from "@lfd/storage";

import { resetToSeed } from "../src/dev/seeding/reset.seed.js";
import { clearSeededBuckets } from "../src/dev/seeding/storage.seed.js";
import { PrismaClient } from "../src/platform/database/client/client.js";
import { refuseNonLocalTarget } from "./local-target.js";

/**
 * ⚠️ **Remet la base sur ce que le seed déclare** — l'inverse destructif de
 * `db:seed`, en ligne de commande.
 *
 * La logique vit dans `src/dev/seeding/reset.seed.ts`, partagée avec le bouton
 * du back-office : ce script n'est qu'une porte d'entrée, un garde-fou de cible,
 * et un compte rendu.
 *
 * Il vide **aussi les buckets** du poste, pour la même raison que le bouton : un
 * bon de commande archivé survit à la commande qui l'a produit, et il est rendu
 * TEL QUEL au téléchargement suivant. Sans ça, un poste sert le vieux dessin sur
 * une commande neuve, et on cherche le défaut dans le rendu.
 *
 * ⚠️ Les coordonnées du stockage sont lues ici — `prisma/` est l'un des rares
 * endroits autorisés à toucher `process.env` — mais la serrure, elle, vit dans
 * `storage.seed.ts` : elle refuse tout point de terminaison hors boucle locale,
 * donc ce script ne PEUT PAS viser R2, même mal configuré.
 */
async function main(): Promise<void> {
  const connectionString = process.env["DATABASE_LFD_URL"] ?? "";
  refuseNonLocalTarget(
    connectionString,
    "ce script SUPPRIME des sociétés, des personnes et leurs commandes.",
  );

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const report = await resetToSeed(prisma);
    console.log(
      `✔ ${report.companies} société(s) et ${report.people} personne(s) supprimées, ` +
        `station élaguée de ${report.pickupPoints} point(s) et ${report.zones} zone(s).`,
    );

    const buckets = await clearSeededBuckets([
      bucketConfig("R2_CUSTOMERS_BUCKET"),
      bucketConfig("R2_PRODUCTION_BUCKET"),
    ]);
    for (const bucket of buckets) {
      console.log(`✔ bucket ${bucket.bucket} vidé : ${String(bucket.objects)} objet(s).`);
    }
    if (buckets.length === 0) {
      console.log("· aucun bucket configuré sur ce poste — rien à vider.");
    }
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Les coordonnées d'un bucket, ou `null` si l'usage n'est pas configuré.
 *
 * Le triplet va ENSEMBLE : un bucket sans ses clés ne s'ouvre pas, et le
 * compléter par un défaut désignerait un stockage que personne n'a voulu.
 */
function bucketConfig(bucketVar: string): S3StorageConfig | null {
  const bucket = process.env[bucketVar] ?? "";
  const prefix = bucketVar.replace("_BUCKET", "");
  const accessKeyId = process.env[`${prefix}_ACCESS_KEY_ID`] ?? "";
  const secretAccessKey = process.env[`${prefix}_SECRET_ACCESS_KEY`] ?? "";
  const endpoint = process.env[`${prefix}_ENDPOINT`] ?? process.env["R2_ENDPOINT"] ?? "";
  if (bucket === "" || accessKeyId === "" || secretAccessKey === "" || endpoint === "") {
    return null;
  }
  return {
    bucket,
    accessKeyId,
    secretAccessKey,
    endpoint,
    region: process.env["R2_REGION"] ?? "auto",
  };
}

main().catch((error: unknown) => {
  console.error("✗ reset échoué :", error);
  process.exitCode = 1;
});
