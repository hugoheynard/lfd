/**
 * **Importe la plaquette professionnelle comme grille de prix négociés** —
 * `pnpm mercuriale:import` (compte rendu seul) puis `--appliquer` (écriture).
 *
 * ## Pourquoi un import et pas une règle
 *
 * On a cherché la formule qui dérive le prix professionnel du prix public. Il
 * n'y en a pas : les 89 prix de la plaquette ont été posés à la main, article
 * par article (`documentation/pim/analyse-plaquette-professionnelle.md`). Ce
 * sont donc des DÉCISIONS, et elles entrent là où la plateforme range les
 * décisions commerciales — `catalog_item_overrides`, le prix B2B par article,
 * qui recouvre celui du référentiel sans l'effacer.
 *
 * ## Il n'écrit RIEN par défaut
 *
 * Le geste touche l'argent d'un catalogue en service. Sans `--appliquer`, le
 * script lit, rapproche, et rend son compte rendu : combien de lignes
 * s'apparient, lesquelles ne trouvent pas leur article, lesquelles en trouvent
 * DEUX, et combien d'articles resteront au prix du référentiel. On regarde
 * d'abord, on écrit ensuite.
 *
 * ## Il passe par le DOMAINE, jamais par la colonne
 *
 * Chaque prix part en `SetB2bPriceCommand` sur le vrai bus, comme un clic du
 * back-office. Écrire `catalogItemOverride` en direct contournerait les refus de
 * l'agrégat (prix nul ou négatif, prix identique à celui du PIM) et laisserait
 * `decided_by` vide — or la question posée six mois plus tard est toujours
 * « qui a accordé ce prix ». Il répond : `import-plaquette-hiver-2026`.
 *
 * ## Idempotent
 *
 * Rejouer ne change rien : une ligne déjà au prix voulu est comptée « déjà
 * posée » et n'est pas réécrite. Une ligne dont le prix imprimé coïncide avec
 * celui du référentiel est laissée au référentiel — poser une décision locale
 * identique serait une décision vide, et l'agrégat la refuse.
 *
 * 🔴 **Il n'annule rien.** Un prix B2B posé ailleurs et absent de la plaquette
 * est laissé tel quel : la plaquette est une grille, pas une remise à zéro.
 * Revenir au tarif du référentiel est un geste à part (`alignOnPim`).
 */
import "dotenv/config";
import { CommandBus } from "@nestjs/cqrs";
import { Test } from "@nestjs/testing";

import { AppModule } from "../src/appBootstrap/app.module.js";
import { SetB2bPriceCommand } from "../src/b2b/catalog/application/commands/catalog-decision.commands.js";
import { CatalogAdminReader } from "../src/b2b/catalog/domain/ports/catalog-admin.reader.js";
import { runWithRequestContext } from "../src/platform/context/request-context.store.js";
import { newTraceId } from "../src/platform/context/trace-context.js";
import { DocumentStore } from "../src/platform/storage/document-store.js";
import { FakeDocumentStore } from "./seed-growth/fake-document-store.js";
import { lignesInversees, rapprocher, type ArticleCatalogue } from "./mercuriale/matching.js";
import { PLAQUETTE_HIVER_2026 } from "./mercuriale/plaquette-hiver-2026.js";

/** L'auteur des décisions, reconnaissable dans `decided_by` six mois plus tard. */
const AUTEUR = "import-plaquette-hiver-2026";

const APPLIQUER = process.argv.includes("--appliquer");

function euros(millicents: number): string {
  return `${(millicents / 100_000).toFixed(2).replace(".", ",")} €`;
}

async function main(): Promise<void> {
  const module = await Test.createTestingModule({ imports: [AppModule] })
    // R2 n'est pas configuré hors production, et un import de prix n'a rien à
    // écrire dans un bucket. C'est la SEULE doublure : ni le domaine, ni la
    // persistance, ni le journal — sinon l'import produirait un état que le
    // code refuse.
    .overrideProvider(DocumentStore)
    .useClass(FakeDocumentStore)
    .compile();
  await module.init();

  try {
    const reader = module.get(CatalogAdminReader, { strict: false });
    const commands = module.get(CommandBus, { strict: false });

    const articles: ArticleCatalogue[] = (await reader.list()).map((item) => ({
      sku: item.sku,
      nom: item.name,
      pimPriceMillicents: item.pimPriceMillicents,
    }));
    const dejaPose = new Map(
      (await reader.list()).map((item) => [item.sku, item.b2bPriceMillicents]),
    );

    const { apparies, refuses, nonCites } = rapprocher(PLAQUETTE_HIVER_2026, articles);

    console.log(`\n📖 Plaquette Hiver 2026 — ${String(PLAQUETTE_HIVER_2026.length)} lignes`);
    console.log(`🗂️  Catalogue B2B — ${String(articles.length)} articles\n`);

    const aEcrire = apparies.filter(
      (a) => !a.dejaAuPrixPim && dejaPose.get(a.article.sku) !== a.ligne.proHtMillicents,
    );
    const inchanges = apparies.length - aEcrire.length;

    console.log(`✅ ${String(apparies.length)} ligne(s) appariée(s)`);
    console.log(`   dont ${String(aEcrire.length)} à écrire, ${String(inchanges)} déjà en place`);

    if (refuses.length > 0) {
      console.log(`\n⚠️  ${String(refuses.length)} ligne(s) NON importée(s) :`);
      for (const refus of refuses) {
        const detail =
          refus.motif === "ambigu"
            ? `plusieurs articles portent ce nom (${refus.candidats.join(", ")}) — trancher à la main`
            : "aucun article du catalogue B2B ne porte ce nom";
        console.log(`   · ${refus.ligne.nom} — ${detail}`);
      }
    }

    if (nonCites.length > 0) {
      console.log(
        `\nℹ️  ${String(nonCites.length)} article(s) du catalogue B2B ne sont pas dans la` +
          ` plaquette : ils gardent le prix du référentiel.`,
      );
      for (const article of nonCites) {
        console.log(`   · ${article.nom} (${article.sku})`);
      }
    }

    // 🔴 La vraie nouvelle quand la plaquette dépasse le catalogue. Elle
    // annonce des articles que la plateforme ne vend pas : un client
    // professionnel qui les commande ne les trouvera nulle part, et aucun
    // import de prix n'y change quoi que ce soit.
    const manquants = PLAQUETTE_HIVER_2026.length - apparies.length - 0;
    if (articles.length < PLAQUETTE_HIVER_2026.length) {
      console.log(
        `\n🔴 La plaquette annonce ${String(PLAQUETTE_HIVER_2026.length)} articles, le catalogue` +
          ` B2B n'en porte que ${String(articles.length)}. Au moins` +
          ` ${String(PLAQUETTE_HIVER_2026.length - articles.length)} lignes ne peuvent PAS` +
          ` s'apparier, quel que soit leur nom : l'article n'est pas vendu aux professionnels.` +
          ` ${String(manquants)} lignes restent sans prix posé.`,
      );
    }

    const inversees = lignesInversees(PLAQUETTE_HIVER_2026);
    if (inversees.length > 0) {
      console.log(
        `\n🔴 ${String(inversees.length)} prix IMPRIMÉS sont inversés — le professionnel y paie` +
          ` hors taxe plus cher que le particulier toutes taxes comprises.` +
          ` Ils sont importés tels quels : la plaquette est l'engagement.`,
      );
      for (const ligne of inversees) {
        console.log(
          `   · ${ligne.nom} — ${euros(ligne.proHtMillicents)} HT` +
            ` contre ${(ligne.publicTtcCents / 100).toFixed(2).replace(".", ",")} € TTC public`,
        );
      }
    }

    if (!APPLIQUER) {
      console.log(`\n👀 Rien n'a été écrit. Relancer avec « --appliquer » pour poser les prix.\n`);
      return;
    }

    let poses = 0;
    for (const { ligne, article } of aEcrire) {
      // Un contexte de requête par écriture : le `Clock` et le journal lisent
      // ce `now`, et un import qui n'en poserait pas écrirait hors contexte.
      await runWithRequestContext(
        { now: new Date(), traceId: newTraceId(), actor: { type: "staff", id: AUTEUR } },
        () =>
          commands.execute<SetB2bPriceCommand, void>(
            new SetB2bPriceCommand(article.sku, ligne.proHtMillicents, AUTEUR),
          ),
      );
      poses += 1;
    }
    console.log(`\n💶 ${String(poses)} prix négocié(s) posé(s).\n`);
  } finally {
    await module.close();
  }
}

await main();
