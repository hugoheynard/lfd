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
 * ## Plus aucune exception (depuis le 2026-09-19)
 *
 * 24 fichiers en portaient plusieurs au 2026-09-09. La porte les a d'abord
 * GELÉS dans une liste qui ne pouvait que se vider ; le 2026-09-19, à la
 * demande de Hugo, les 22 derniers ont été découpés et la liste a disparu.
 * Il n'y a donc plus rien à inscrire : un fichier qui porte deux handlers
 * échoue, quel qu'il soit.
 *
 * La liste avait un trou, et c'est une raison de plus de ne pas la
 * rouvrir : elle ne parcourait que les fichiers PRÉSENTS, si bien qu'une
 * entrée dont le fichier avait été supprimé restait inscrite sans que rien
 * ne rougisse. Une exception, s'il en fallait une un jour, se justifierait
 * dans un commentaire au-dessus des handlers — pas dans une liste ici.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SRC = join(ROOT, "apps", "lfd-api", "src");

const DECORATOR = /^[^\S\n]*@(?:CommandHandler|QueryHandler|EventsHandler)\s*\(/gm;

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

const multiples = [];
let withHandler = 0;

for (const file of sources(SRC)) {
  const path = relative(SRC, file).split(sep).join("/");
  const count = handlersIn(file);
  if (count >= 1) {
    withHandler += 1;
  }
  if (count > 1) {
    multiples.push([path, count]);
  }
}

if (multiples.length > 0) {
  console.error("\n✗ handler-per-file\n");
  for (const [path, count] of multiples) {
    console.error(`  ${path}  porte ${String(count)} handlers — un fichier, un handler`);
  }
  console.error(
    "\n  Un handler fait UNE chose. Le fichier qui en porte plusieurs devient\n" +
      "  l'endroit où l'on ajoute la suivante, et « où est traité X ? » cesse de\n" +
      "  se répondre par un nom de fichier.\n",
  );
  process.exit(1);
}

console.log(`✓ handler-per-file : ${String(withHandler)} fichier(s), un handler chacun.`);
