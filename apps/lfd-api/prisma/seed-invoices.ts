import "dotenv/config";

import { seedInvoices } from "../src/dev/seeding/invoices.seed.js";
import { AppConfig } from "../src/platform/config/app-config.js";
import { refuseNonLocalTarget } from "./local-target.js";
import { bootstrapHarness } from "./seed-growth/harness.js";

/**
 * **Les factures des sites du groupe des Cimes**, en ligne de commande —
 * `pnpm --filter lfd-api seed:invoices`.
 *
 * La logique vit dans `src/dev/seeding/invoices.seed.ts`. À lancer APRÈS
 * `seed:sub-accounts`, une seule fois par poste : une facture ne s'efface pas.
 */

/** L'utilisateur de développement de la boutique, déjà administrateur du groupe. */
const DEV_USER_ID = "dev_test_ocp";

async function main(): Promise<void> {
  refuseNonLocalTarget(
    process.env["DATABASE_LFD_URL"] ?? "",
    "ce script émet des factures, qui sont immuables.",
  );

  const harness = await bootstrapHarness();
  try {
    // Le mur se lit ICI, une fois : une ligne de commande EST l'adaptateur de
    // son propre instant (`clock-port`).
    const report = await seedInvoices({
      prisma: harness.prisma,
      commands: harness.commands,
      now: new Date(),
      settle: () => harness.settle(),
      config: harness.module.get(AppConfig, { strict: false }),
      devUserId: DEV_USER_ID,
    });
    if (report.kind === "already_seeded") {
      console.log(
        `· Déjà semé : ${String(report.invoices)} facture(s) sur le groupe des Cimes — rien ` +
          `n'est refait (une facture ne s'efface pas). « ${DEV_USER_ID} » reste administrateur des deux hôtels.\n` +
          `· ${String(report.handedOver)} commande(s) passée(s) des Cimes retirée(s) au comptoir (rattrapage).\n` +
          `· ${String(report.dated)} commande(s) retirée(s) datée(s) de leur livraison (reprise ZL).`,
      );
      return;
    }
    console.log(
      `✔ ${String(report.weeks.length)} semaines facturées (hebdomadaire) :\n` +
        report.weeks.map((week) => `  · clôture ${week.closesAt} — ${week.fate}`).join("\n") +
        `\n✔ ${String(report.returns)} retour(s) bancaire(s) saisi(s)` +
        (report.skippedReturns.length === 0
          ? "."
          : ` ; échéance pas encore passée, sans retour : ${report.skippedReturns.join(", ")}.`) +
        `\n✔ « ${DEV_USER_ID} » administrateur des deux hôtels.`,
    );
  } finally {
    await harness.close();
  }
}

await main();
