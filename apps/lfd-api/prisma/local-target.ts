/**
 * **La cible est-elle ma machine ?** — le garde-fou commun des scripts de seed.
 *
 * Une **liste blanche**, et non une négation de l'hôte de production : ce qui
 * n'est pas explicitement local doit être refusé, y compris ce qu'on n'a pas
 * pensé à interdire. C'est la seule forme qui reste juste le jour où un nouvel
 * environnement apparaît.
 *
 * Il vivait dans `seed-pim.ts` et n'y protégeait que lui. Le seed de
 * développement écrit désormais des clients, et son reset en **supprime** —
 * c'est exactement le genre de script qu'on ne veut pas voir pointer ailleurs
 * que sur un poste.
 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Refuse toute cible qui n'est pas un Postgres **direct et local**.
 *
 * 🔴 **C'est l'HÔTE qui décide, pas le schéma.** Tant que la production passait
 * par Accelerate (`prisma+postgres://`), le schéma suffisait à la reconnaître,
 * et plusieurs outils s'en contentaient. Depuis la sortie d'Accelerate
 * (`documentation/ops/plan-sortie-d-accelerate.md`), la production s'écrit
 * `postgres://…@pooled.db.prisma.io` : un outil qui ne lirait que le schéma
 * la prendrait pour un conteneur local. L'URL Accelerate reste refusée par le
 * même test, jusqu'au resserrement.
 *
 * @param what ce que le script fera à cette base — le message d'erreur le cite,
 * parce qu'un refus qui ne dit pas ce qu'il a évité s'apprend mal.
 */
export function refuseNonLocalTarget(url: string, what: string): void {
  if (url === "") {
    throw new Error("DATABASE_LFD_URL manquant : aucune cible.");
  }
  if (!url.startsWith("postgresql://") && !url.startsWith("postgres://")) {
    throw new Error(
      "Cible refusée : ce script n'écrit QUE vers un Postgres direct local " +
        "(postgresql://localhost…). Une URL Accelerate désigne une base distante.",
    );
  }
  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`Cible refusée (hôte « ${host} ») : ${what}`);
  }
}
