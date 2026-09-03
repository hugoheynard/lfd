/**
 * Seed du **référentiel**, rejoué par le bus — `pnpm --filter lfd-api seed:pim`.
 *
 * ## Ce qu'il fait, et pourquoi pas en SQL
 *
 * Il rejoue le catalogue du dépôt (`seed-pim/catalogue.ts`) **commande par
 * commande**, dans l'ordre où un humain parcourt le cycle : ouvrir la fiche,
 * tarifer, décrire, déclarer les allergènes, placer sur la matrice, régler les
 * taux, signer, mettre en vente.
 *
 * **Aucune base n'est lue pour fabriquer la donnée.** Le catalogue est du code,
 * relu en revue et modifié à la main. Un outil qui irait le chercher dans une
 * base d'exploitation ouvrirait une porte vers la production à chaque `pnpm
 * seed` — c'est précisément ce qu'on ne veut pas.
 *
 * `pim-seed.ts`, son prédécesseur, écrit en Prisma direct. C'est pour ça que la
 * base de développement porte 95 déclinaisons actives dont **une seule** a une
 * fiche réglementaire : les `upsert` ne connaissent pas l'invariant 7, donc ils
 * ont fabriqué un catalogue que le domaine refuse de publier. Un seed qui
 * contourne les invariants produit un état que la production ne verra jamais —
 * et tout ce qu'on développe dessus repose sur un cas impossible.
 *
 * Ici, ce qui entre est ce que les écrans peuvent produire. Ce qui est refusé
 * est **rapporté**, pas contourné.
 *
 * ## Le garde-fou
 *
 * Le seed **refuse toute cible qui n'est pas un Postgres local**. Même motif
 * que `clone-dev.ts`, et une raison de plus ici : avec
 * `SEED_PIM_SYNTHETIC_SHEETS=1`, il écrit des déclarations d'allergènes
 * inventées. Une donnée réglementaire fausse en production n'est pas une gêne
 * de développement.
 *
 * ```bash
 * pnpm dev:infra                                    # Postgres local
 * SEED_PIM_SYNTHETIC_SHEETS=1 SEED_PIM_PUBLISH_ALL=1 pnpm --filter lfd-api seed:pim
 * ```
 *
 * ## Les deux drapeaux
 *
 * Tous deux **éteints par défaut**, tous deux nécessaires pour obtenir un
 * catalogue en vente à partir d'une source qui n'en a pas :
 *
 * - `SEED_PIM_SYNTHETIC_SHEETS=1` — pose des allergènes INVENTÉS là où la source
 *   n'en déclare pas (cf. `seed-pim/declarations.ts`) ;
 * - `SEED_PIM_PUBLISH_ALL=1` — met en vente tout ce qui est publiable, au lieu
 *   de recopier le statut de la source.
 *
 * Ni l'un ni l'autre ne contourne un refus du domaine : `publish()` juge dans
 * les deux cas.
 */
import "dotenv/config";

import { openB2bChannel, type B2bChannelReport } from "./seed-pim/b2b-channel.js";
import { CATALOGUE } from "./seed-pim/catalogue.js";
import { bootstrapHarness, SEED_STAFF } from "./seed-pim/harness.js";
import { syntheticSheetsEnabled } from "./seed-pim/declarations.js";
import { seedRegistry, type RegistryCounts } from "./seed-pim/registry.js";
import { replayProducts, type ReplayReport } from "./seed-pim/replay.js";

/**
 * Les hôtes acceptés comme « ma machine ». Une liste, et non une négation de
 * l'hôte de production : ce qui n'est pas explicitement local doit être refusé,
 * y compris ce qu'on n'a pas pensé à interdire.
 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function refuseNonLocalTarget(url: string): void {
  if (url === "") {
    throw new Error("DATABASE_LFD_URL manquant : aucune cible à seeder.");
  }
  if (!url.startsWith("postgresql://") && !url.startsWith("postgres://")) {
    throw new Error(
      "Cible refusée : le seed n'écrit QUE vers un Postgres direct local " +
        "(postgresql://). Une URL Accelerate désigne une base distante.",
    );
  }
  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Cible refusée (hôte « ${host} ») : le seed n'écrit QUE vers une base locale. ` +
        "Il rejoue un catalogue et peut poser des déclarations d'allergènes inventées.",
    );
  }
}

async function main(): Promise<void> {
  refuseNonLocalTarget(process.env["DATABASE_LFD_URL"] ?? "");

  announce();

  const harness = await bootstrapHarness();
  try {
    // Un seul `now` pour tout le rejeu : les fiches sont ouvertes, signées et
    // mises en vente dans la même seconde, et le journal le raconte ainsi. Un
    // `new Date()` par commande daterait 95 ouvertures sur quelques secondes,
    // ce qui ressemblerait à une saisie humaine sans en être une.
    const now = new Date();
    const { registry, counts } = await harness.runAt(now, SEED_STAFF, () =>
      seedRegistry(harness.commands, harness.prisma, CATALOGUE),
    );
    const report = await harness.runAt(now, SEED_STAFF, () =>
      replayProducts(harness.commands, harness.prisma, CATALOGUE.products, registry),
    );
    const channel = await harness.runAt(now, SEED_STAFF, () =>
      openB2bChannel(harness.membership, harness.prisma, CATALOGUE),
    );
    summarize(counts, report, channel);
  } finally {
    await harness.close();
  }
}

function announce(): void {
  process.stdout.write(
    `▸ catalogue du dépôt — ${CATALOGUE.products.length} fiches à rejouer\n` +
      (syntheticSheetsEnabled()
        ? "  ⚠ SEED_PIM_SYNTHETIC_SHEETS=1 — les fiches sans allergènes en recevront " +
          "d'INVENTÉS (indice glycémique = 0 comme marque).\n"
        : "  · fiches réglementaires : seules celles du corpus. Les autres resteront " +
          "brouillon (SEED_PIM_SYNTHETIC_SHEETS=1 pour en poser).\n"),
  );
}

function summarize(counts: RegistryCounts, report: ReplayReport, channel: B2bChannelReport): void {
  process.stdout.write(
    "✔ seed du référentiel terminé\n" +
      `  référentiel — contextes=+${counts.contextsCreated} points de vente=+${counts.pointsCreated} ` +
      `taux=+${counts.ratesCreated} familles=+${counts.categoriesCreated}\n` +
      `  fiches — créées=${report.created} retrouvées=${report.updated} ` +
      `mises en vente=${report.published} signées=${report.signed} ` +
      `archivées=${report.archived}\n` +
      `  canal B2B — vendues aux pros par la matrice=${channel.sold}, ` +
      `en vente sur le canal=${channel.opened}\n`,
  );
  if (report.refused.length > 0) {
    process.stdout.write(`  ${report.refused.length} refus :\n`);
    for (const line of report.refused.slice(0, 20)) {
      process.stdout.write(`    · ${line}\n`);
    }
    if (report.refused.length > 20) {
      process.stdout.write(`    … et ${report.refused.length - 20} autres\n`);
    }
  }
}

main().catch((error: unknown) => {
  console.error("✗ seed du référentiel échoué :", error);
  process.exitCode = 1;
});
