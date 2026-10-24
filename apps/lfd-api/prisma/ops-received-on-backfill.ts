import { CommandBus } from "@nestjs/cqrs";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "../src/appBootstrap/app.module.js";
import { OrderHandoverHistoryReader } from "../src/handover/channels/commerce/index.js";
import { AppConfig } from "../src/platform/config/app-config.js";
import { PrismaService } from "../src/platform/database/prisma.service.js";
import { BackgroundWork } from "../src/platform/events/background-work.js";
import { afterIsClean, describeTarget, runReceivedOnBackfill } from "./ops/received-on-backfill.js";

/**
 * **`pnpm --filter lfd-api ops:received-on-backfill [--apply]`** — la reprise
 * des dates de réception (plan `documentation/commandes/plan-date-de-reception.md`, §8).
 *
 * Sans `--apply` : simulation — contrôles « avant », et ce qui serait fait.
 * Avec `--apply` : les mêmes, une commande par commande remise sans date, puis
 * les contrôles « après » ; code de sortie 1 si l'un d'eux n'est pas à zéro.
 *
 * Contrairement aux semis, il n'est PAS limité à une base locale : il est
 * écrit pour la production. Il amorce l'application réelle, sans aucun double
 * — l'écriture passe par le vrai bus. La cible (hôte, port, base) s'affiche
 * avant tout ; jamais l'utilisateur ni le mot de passe.
 */
async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error"] });
  try {
    const target = describeTarget(app.get(AppConfig).databaseUrl());
    console.log(`Base ciblée : ${target} — mode ${apply ? "RÉEL (--apply)" : "simulation"}`);
    const report = await runReceivedOnBackfill(
      {
        prisma: app.get(PrismaService),
        commands: app.get(CommandBus),
        handovers: app.get(OrderHandoverHistoryReader),
        log: (line) => console.log(line),
      },
      apply,
    );
    if (report.after !== null) {
      console.log(`${String(report.dated)} commande(s) passée(s) à la commande de reprise.`);
      if (!afterIsClean(report.after)) {
        console.error("✘ Un contrôle « après » n'est pas à zéro : voir ci-dessus.");
        process.exitCode = 1;
      }
    }
  } finally {
    await app.get(BackgroundWork).whenIdle();
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error("reprise des dates de réception : échec", error);
  process.exitCode = 1;
});
