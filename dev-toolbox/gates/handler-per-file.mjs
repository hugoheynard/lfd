#!/usr/bin/env node
/**
 * Gate : **un seul handler par fichier** (`CLAUDE.md` §4).
 *
 * Un handler fait **une** chose. Le fichier qui en porte six fait six choses, et
 * il devient l'endroit où l'on ajoute la septième — parce qu'il est déjà là,
 * parce que l'import existe déjà, parce que « c'est le même agrégat ». C'est la
 * pente qui a produit `admin-address.handlers.ts` et ses six handlers.
 *
 * ## Ce que ça coûte, concrètement
 *
 * - **la recherche** : « où est traité `CloseVolumeCommitment` ? » ne se répond
 *   plus par un nom de fichier ;
 * - **le diff** : deux intentions sans rapport se touchent dans le même
 *   fichier, donc dans le même conflit de fusion ;
 * - **le test colocalisé** : `__tests__/x.handlers.spec.ts` éprouve six cas et
 *   ne dit plus lequel n'est pas couvert.
 *
 * ## Les DEUX styles du dépôt sont acceptés, et c'est voulu
 *
 * `CLAUDE.md` §4 décrit deux organisations, et interdit de les mélanger :
 *
 * - **B2B** : `create-company.command.ts` + `create-company.handler.ts` — un
 *   handler par fichier, la commande à côté ;
 * - **PIM** : `create-product.ts` — la commande ET son handler colocalisés.
 *
 * Les deux respectent cette règle : un fichier, **un** handler. Ce gate ne
 * tranche donc pas entre les styles — il compte les décorateurs, rien de plus.
 *
 * ## La détection
 *
 * Un décorateur en **début de ligne** : `^\\s*@CommandHandler(`. Le `^\\s*@`
 * suffit à écarter la prose — dans un JSDoc la ligne commence par ` * `, jamais
 * par `@`. Ça compte : `platform/bus/bus.module.ts` cite les deux décorateurs
 * dans un commentaire, et un `grep` naïf le comptait parmi les fautifs. Une
 * porte qui démarre avec un faux positif dans son propre inventaire n'est pas
 * une porte, c'est un bruit qu'on apprend à ignorer.
 *
 * Les `__tests__/` sont hors sujet : une spec déclare parfois un handler
 * jetable, et ce n'est pas de l'architecture.
 *
 * ## L'inventaire GÈLE la dette, il ne l'absout pas
 *
 * 24 fichiers en portent plusieurs au 2026-09-09. Les interdire d'un coup
 * demanderait un lot de découpe qui n'est pas celui du jour ; les ignorer
 * laisserait la pente ouverte. L'inventaire est donc **figé** :
 *
 * - un fichier **hors liste** qui gagne un second handler **échoue** ;
 * - un fichier **de la liste** qui n'en a plus qu'un **échoue aussi** — il faut
 *   le retirer de l'inventaire. La liste ne peut que se vider, et elle ne ment
 *   jamais sur ce qui reste.
 *
 * Le plan de découpe est dans
 * `documentation/todos/todo-un-handler-par-fichier.md`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SRC = join(ROOT, "apps", "lfd-api", "src");

const DECORATOR = /^[^\S\n]*@(?:CommandHandler|QueryHandler|EventsHandler)\s*\(/gm;

/**
 * **Les fichiers qui portent plusieurs handlers au 2026-09-09.**
 *
 * Chemins relatifs à `apps/lfd-api/src`, séparateur `/` quel que soit l'OS.
 * En baisse seulement.
 */
const KNOWN_MULTI = new Set([
  "b2b/account/application/commands/admin-address.handlers.ts",
  "b2b/account/application/commands/admin-company.handlers.ts",
  "b2b/account/application/commands/admin-contact.handlers.ts",
  "b2b/account/application/commands/certify-kbis.handler.ts",
  "b2b/catalog/application/commands/catalog-decision.handlers.ts",
  "b2b/delivery-zones/application/delivery-zone.handlers.ts",
  "b2b/growth/application/handlers/on-support-activity.handler.ts",
  "b2b/order-cutoffs/application/order-cutoff.handlers.ts",
  "b2b/order-waivers/application/order-cutoff-waiver.handlers.ts",
  "b2b/order-waivers/application/order-late-fee.handlers.ts",
  "b2b/payments/application/mandate.handlers.ts",
  "b2b/pickup-addresses/application/pickup-address.handlers.ts",
  "b2b/pricing/application/commands/company-mercuriale.handlers.ts",
  "b2b/pricing/application/commands/price-template.handlers.ts",
  "b2b/pricing/application/commands/pricing.handlers.ts",
  "b2b/pricing/application/commands/rule-lifecycle.handlers.ts",
  "b2b/pricing/application/commands/volume-commitment.handlers.ts",
  "b2b/pricing/application/commands/volume-ladder.handlers.ts",
  "pim/ingredients/application/appellation-handlers.ts",
  "pim/ingredients/application/ingredient-handlers.ts",
  "production/application/queries/get-production-paper.handler.ts",
  "staff/directory/application/staff-user.handlers.ts",
  "staff/invitations/pending-staff-access.ts",
  "staff/permissions/application/staff-role.handlers.ts",
]);

/** Tous les `.ts` de production sous `src`, les `__tests__/` exclus. */
function* sources(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== "__tests__" && entry !== "client") {
        yield* sources(full);
      }
    } else if (entry.endsWith(".ts")) {
      yield full;
    }
  }
}

/** Le nombre de handlers DÉCLARÉS — la prose ne compte pas. */
function handlersIn(file) {
  DECORATOR.lastIndex = 0;
  return (readFileSync(file, "utf8").match(DECORATOR) ?? []).length;
}

const neuf = [];
const nettoyes = [];
let carrying = 0;
let withHandler = 0;

for (const file of sources(SRC)) {
  const path = relative(SRC, file).split(sep).join("/");
  const count = handlersIn(file);
  if (count >= 1) {
    withHandler += 1;
  }
  if (count > 1) {
    if (KNOWN_MULTI.has(path)) {
      carrying += 1;
    } else {
      neuf.push([path, count]);
    }
  } else if (KNOWN_MULTI.has(path)) {
    nettoyes.push(path);
  }
}

if (neuf.length > 0 || nettoyes.length > 0) {
  console.error("\n✗ handler-per-file\n");
  for (const [path, count] of neuf) {
    console.error(`  ${path}  porte ${String(count)} handlers — un fichier, un handler`);
  }
  for (const path of nettoyes) {
    console.error(`  ${path}  n'en porte plus qu'un : le retirer de KNOWN_MULTI`);
  }
  if (neuf.length > 0) {
    console.error(
      "\n  Un handler fait UNE chose. Le fichier qui en porte plusieurs devient\n" +
        "  l'endroit où l'on ajoute la suivante, et « où est traité X ? » cesse de\n" +
        "  se répondre par un nom de fichier.\n",
    );
  }
  if (nettoyes.length > 0) {
    console.error("\n  La liste ne peut que se vider — sinon elle ment sur ce qui reste.\n");
  }
  process.exit(1);
}

console.log(
  `✓ handler-per-file : ${String(withHandler)} fichier(s) portent un handler, ` +
    `${String(withHandler - carrying)} n'en portent qu'un.\n` +
    `  Dette gelée : ${String(carrying)} fichier(s) — comptés, en baisse seulement ` +
    `(documentation/todos/todo-un-handler-par-fichier.md).`,
);
