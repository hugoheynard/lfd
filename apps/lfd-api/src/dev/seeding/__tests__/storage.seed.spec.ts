import type { S3StorageConfig } from "@lfd/storage";

import { clearBucket, clearSeededBuckets } from "../storage.seed.js";

/**
 * Ce que ces cas tiennent n'est pas « le nettoyage nettoie » — il le fait, et un
 * e2e le prouverait mieux. C'est **ce qu'il refuse**.
 *
 * Ce module vide des buckets. Vider celui de production retirerait à des clients
 * le seul document qu'ils peuvent nous opposer, et aucun retour arrière ne le
 * rendrait. La serrure est donc au niveau le plus bas — dans la fonction qui
 * ouvre le client S3 —, et elle rend le geste **inexprimable** contre R2 plutôt
 * qu'interdit par une couche au-dessus qu'on pourrait contourner.
 *
 * ⚠️ Aucun de ces cas ne joint MinIO : ils s'arrêtent tous avant, sur le refus.
 * Le seul qui passerait la serrure n'est pas ici — il vit dans le rechargement,
 * qu'on éprouve en le lançant.
 */

function config(endpoint: string): S3StorageConfig {
  return {
    bucket: "lfc-customers-dev",
    accessKeyId: "lfc",
    secretAccessKey: "lfclfclfc",
    endpoint,
    region: "auto",
  };
}

describe("la serrure du nettoyage de buckets", () => {
  it("refuse R2, en nommant l'hôte qu'on a failli vider", async () => {
    await expect(clearBucket(config("https://abc123.r2.cloudflarestorage.com"))).rejects.toThrow(
      /abc123\.r2\.cloudflarestorage\.com/u,
    );
  });

  it("refuse un point de terminaison ABSENT plutôt que d'en supposer un", async () => {
    // Un défaut implicite désignerait le stockage de quelqu'un d'autre. Une
    // configuration incomplète doit refuser, jamais retomber sur une cible.
    await expect(clearBucket(config(""))).rejects.toThrow(/point de terminaison/u);
  });

  it("refuse un hôte qui RESSEMBLE à la boucle locale sans en être", async () => {
    // `localhost.exemple.fr` n'est la machine de personne. La vérification lit
    // l'hôte par `URL`, pas par un préfixe de chaîne — c'est la même erreur que
    // le lecteur de médias avait déjà rencontrée.
    await expect(clearBucket(config("http://localhost.exemple.fr:9100"))).rejects.toThrow(
      /localhost\.exemple\.fr/u,
    );
  });

  it("laisse passer un usage NON CONFIGURÉ sans faire échouer le rechargement", async () => {
    // Sur un poste, tous les usages ne sont pas configurés. Refuser le
    // rechargement entier parce qu'un bucket facultatif manque serait
    // disproportionné — le compte rendu ne le nomme simplement pas.
    await expect(clearSeededBuckets([null, null])).resolves.toEqual([]);
  });
});
