import "dotenv/config";

import { CLIENT_ENSEIGNE, DEFAULT_IDENTITY, seedClient } from "../src/dev/seeding/client.seed.js";
import { seedStation } from "../src/dev/seeding/station.seed.js";
import { refuseNonLocalTarget } from "./local-target.js";
import { bootstrapHarness } from "./seed-growth/harness.js";

/**
 * **Le seed de développement** — la station, puis le client de référence.
 *
 * ```bash
 * pnpm --filter lfd-api db:seed         # la station et le client
 * pnpm --filter lfd-api seed:orders     # ses commandes, calées sur aujourd'hui
 * pnpm --filter lfd-api db:seed:reset   # ⚠️ supprime tous les AUTRES clients
 * ```
 *
 * ## Une enveloppe, pas une logique
 *
 * Ce qu'il sème vit dans `src/dev/seeding/` — c'est le back-office qui l'a
 * exigé : le bouton « recharger le jeu de données » exécute exactement les mêmes
 * fonctions, et deux corpus de développement qui divergent seraient pires que
 * pas de bouton du tout.
 *
 * 🔴 **Il boote l'application** au lieu d'ouvrir un client Prisma. Tout ce que
 * ce seed pose passe par les VRAIES commandes — déclarer une société, poser une
 * adresse, accorder un terme, activer. Écrire ces lignes en direct enjambait les
 * invariants (deux points de retrait « par défaut », constaté) et, surtout,
 * n'éprouvait rien : un corpus posé à côté des handlers ne prépare pas le
 * produit, il prépare une base qui lui ressemble.
 *
 * ## Additif, toujours
 *
 * Ce script ne supprime **rien** : ré-exécuté, il saute ce qui est déjà là et ne
 * touche à aucune saisie faite à la main. La suppression est un autre script,
 * qui porte son intention dans son nom.
 */
refuseNonLocalTarget(
  process.env["DATABASE_LFD_URL"] ?? "",
  "le seed écrit un client de développement et sa station.",
);

async function main(): Promise<void> {
  const harness = await bootstrapHarness();
  try {
    const context = { prisma: harness.prisma, commands: harness.commands };
    await seedStation(context);
    // L'identité se lit ICI, pas dans le module : `src/` n'a pas le droit de
    // toucher `process.env`, et c'est la ligne de commande qui connaît le poste.
    const client = await seedClient(context, {
      auth0Sub: process.env["SEED_AUTH0_SUB"] ?? DEFAULT_IDENTITY.auth0Sub,
      email: process.env["SEED_EMAIL"] ?? DEFAULT_IDENTITY.email,
    });
    console.log(`\n✔ Base prête — ${CLIENT_ENSEIGNE} (${client.reference}).`);
    console.log("  Étape suivante : pnpm --filter lfd-api seed:orders");
  } finally {
    await harness.close();
  }
}

await main();
