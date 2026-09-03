#!/usr/bin/env node
/**
 * Gate : **les échappatoires de typage restent hors du dépôt.**
 *
 * `CLAUDE.md` §6 les nomme d'une seule phrase — « zéro `any`, zéro
 * `as unknown as T`, zéro `@ts-ignore`, zéro `eslint-disable` » — et la moitié
 * de cette phrase n'avait aucune porte. `no-explicit-any` couvre le premier
 * terme, par ESLint ; les trois autres ne reposaient que sur la relecture.
 *
 * Résultat au 2026-09-03, mesuré : **zéro** `@ts-ignore`, **zéro**
 * `eslint-disable`, et **seize fichiers** portant un `as unknown as` — tous des
 * tests. Le code de production est parfaitement propre.
 *
 * ⚠️ Un `grep` naïf en annonçait vingt et une directive. Les cinq de trop
 * étaient des MENTIONS entre accents graves — dont une qui explique que ce
 * dépôt a REFUSÉ le cast et payé trois ports de plus pour s'en passer. Compter
 * une prose qui applique la règle comme une infraction aurait appris à ignorer
 * la porte dès sa pose ; d'où {@link withoutInlineCode}.
 *
 * ## Pourquoi un cast de test compte PLUS qu'un cast de production
 *
 * Le travail d'un test est d'**échouer quand le code est faux**. Un
 * `as unknown as` dans un doublé est le mécanisme exact qui lui permet de
 * **dériver du port qu'il prétend jouer** : la signature change, le cast
 * l'avale, le test reste vert sur du code qui n'existe plus. C'est la panne que
 * l'en-tête de `ci.yml` nomme, et contre laquelle le typecheck des specs a été
 * posé — le cast la rouvre par-dessous.
 *
 * ## Le cliquet
 *
 * - un fichier **hors liste** qui gagne un cast : la porte échoue ;
 * - un fichier **de la liste** qui n'en a plus : la porte échoue aussi, pour que
 *   la liste se vide au lieu de mentir ;
 * - `@ts-ignore`, `@ts-expect-error`, `eslint-disable` : aucun, nulle part.
 *
 * La dette ne peut donc que décroître, et elle est affichée à chaque exécution
 * plutôt que tue.
 *
 * Usage : `pnpm lint:no-type-escapes` (branché en CI).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();

/** Les arbres écrits à la main. Le client Prisma est généré, il ne compte pas. */
const SCOPES = [
  "apps/lfc-B2B-admin-frontend/src",
  "apps/lfc-B2B-platform-frontend/src",
  "apps/lfd-api/src",
  "apps/lfd-api/test",
  "packages",
  "gateway",
];

const SKIP = new Set(["node_modules", "dist", "client", "coverage", "out-tsc", ".angular"]);

/**
 * Les fichiers qui portent ENCORE un `as unknown as`, au 2026-09-03.
 *
 * Tous des tests, et la liste ne grandit pas : elle se vide. Un fichier nettoyé
 * s'en retire — la porte le réclame, précisément pour qu'on ne garde pas une
 * dette éteinte au tableau.
 */
const KNOWN_CASTS = new Set([
  "apps/lfc-B2B-admin-frontend/src/app/b2b/tarification/__tests__/timeline-axis.spec.ts",
  "apps/lfc-B2B-admin-frontend/src/app/commercial/tarification/simulation/__tests__/piercing-rules.spec.ts",
  "apps/lfc-B2B-admin-frontend/src/app/fiche-client/__tests__/fiche-client.facade.spec.ts",
  "apps/lfc-B2B-admin-frontend/src/app/pim/catalogue/__tests__/sold-contexts.spec.ts",
  "apps/lfc-B2B-admin-frontend/src/app/shared/notifications/__tests__/notifications-panel.spec.ts",
  "apps/lfd-api/src/b2b/account/application/commands/__tests__/issue-password-link.handler.spec.ts",
  "apps/lfd-api/src/b2b/account/application/commands/__tests__/request-activation-support.handler.spec.ts",
  "apps/lfd-api/src/b2b/orders/application/queries/__tests__/get-order-payment.handler.spec.ts",
  "apps/lfd-api/src/b2b/orders/application/queries/__tests__/get-order.handler.spec.ts",
  "apps/lfd-api/src/pim/catalogue/product/application/__tests__/set-product-vat.spec.ts",
  "apps/lfd-api/src/platform/context/__tests__/request-context.middleware.spec.ts",
  "apps/lfd-api/src/platform/shared/http/__tests__/app-error.filter.spec.ts",
  "apps/lfd-api/src/staff/directory/application/__tests__/create-staff-user.handler.spec.ts",
  "apps/lfd-api/test/admin-catalog.e2e-spec.ts",
  "packages/b2b-ui/src/company/__tests__/fulfillment-preference.model.spec.ts",
  "packages/storage/src/__tests__/s3-storage-service.spec.ts",
]);

const DIRECTIVES = /@ts-ignore|@ts-expect-error|eslint-disable/;
const CAST = /as\s+unknown\s+as\b/;

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (!SKIP.has(entry)) {
        yield* walk(path);
      }
    } else if (path.endsWith(".ts") && !path.endsWith(".d.ts")) {
      yield path;
    }
  }
}

/**
 * La ligne, ses accents graves retirés.
 *
 * Une prose qui NOMME `eslint-disable` pour expliquer pourquoi elle s'en passe
 * n'est pas une dérogation — c'est le contraire. `@lfd/mailer` en porte une, et
 * la compter aurait appris à ignorer la porte dès sa pose.
 */
function withoutInlineCode(line) {
  return line.replace(/`[^`]*`/gu, "");
}

const directives = [];
const stray = [];
const cleaned = new Set(KNOWN_CASTS);
let debt = 0;

for (const scope of SCOPES) {
  for (const absolute of walk(join(ROOT, scope))) {
    const path = relative(ROOT, absolute);
    const lines = readFileSync(absolute, "utf8").split("\n");
    let casts = 0;

    lines.forEach((raw, index) => {
      const line = withoutInlineCode(raw);
      if (DIRECTIVES.test(line)) {
        directives.push(`${path}:${String(index + 1)}`);
      }
      if (CAST.test(line)) {
        casts += 1;
        if (!KNOWN_CASTS.has(path)) {
          stray.push(`${path}:${String(index + 1)}`);
        }
      }
    });

    if (casts > 0) {
      debt += casts;
      cleaned.delete(path);
    }
  }
}

let failed = false;

if (directives.length > 0) {
  failed = true;
  console.error("\n❌ Échappatoires de typage — aucune n'est tolérée :\n");
  for (const where of directives) {
    console.error(`   ${where}`);
  }
  console.error("\n   Si les types résistent, le modèle est faux (CLAUDE.md §6).");
}

if (stray.length > 0) {
  failed = true;
  console.error("\n❌ `as unknown as` dans un fichier qui n'en portait pas :\n");
  for (const where of stray) {
    console.error(`   ${where}`);
  }
  console.error(
    "\n   Dans un doublé, ce cast lui permet de DÉRIVER du port qu'il joue :\n" +
      "   la signature change, le cast l'avale, le test reste vert sur du code mort.",
  );
}

if (cleaned.size > 0) {
  failed = true;
  console.error("\n❌ Fichiers nettoyés, encore inscrits à la dette :\n");
  for (const path of [...cleaned].sort()) {
    console.error(`   ${path}`);
  }
  console.error("\n   Les retirer de KNOWN_CASTS — la liste se vide, elle ne ment pas.");
}

if (failed) {
  process.exit(1);
}

console.log(
  debt === 0
    ? "✓ no-type-escapes : aucune échappatoire de typage, et aucune dette."
    : `✓ no-type-escapes : 0 directive, ${String(debt)} \`as unknown as\` dans ` +
        `${String(KNOWN_CASTS.size)} fichier(s) — compté, en baisse seulement.`,
);
