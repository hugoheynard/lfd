#!/usr/bin/env node
/**
 * Gate : **le rangement des sources Prisma dit la vérité.**
 *
 * ## Le trou que cette porte ferme
 *
 * Le schéma a été découpé le 2026-09-10 : un fichier de 4846 lignes est devenu
 * `apps/lfd-api/prisma/schema/`, avec un dossier par schéma Postgres quand il
 * est gros (`public/`, `pim/`) et un fichier quand il tient (`growth.prisma`).
 *
 * 🔴 **Prisma ne regarde pas où vit un fichier.** Il fusionne tous les
 * `.prisma` du dossier en un seul modèle ; `@@schema("…")` reste porté par
 * chaque bloc, et lui seul décide. Un modèle rangé dans `pim/` qui déclarerait
 * `@@schema("public")` compilerait sans un mot, `validate` serait vert, la
 * migration serait juste — et l'arborescence, celle qu'on ouvre pour savoir où
 * chercher, mentirait.
 *
 * C'est exactement le motif que le dépôt connaît : **l'emplacement affirme le
 * modèle**. Un rangement est une hypothèse, jamais une source. Sans cette
 * porte, la découpe serait un confort de lecture qui dérive en trois semaines,
 * et qui trompe d'autant mieux qu'il a l'air rangé.
 *
 * ## Ce qu'elle vérifie
 *
 * 1. Chaque bloc porte le `@@schema` que son emplacement annonce.
 * 2. Chaque schéma du `datasource` a bien un fichier ou un dossier à son nom —
 *    sinon un schéma ajouté vivrait n'importe où.
 * 3. Aucun fichier ni dossier ne nomme un schéma que le `datasource` ignore.
 * 4. `datasource.prisma` ne porte aucun modèle : c'est la racine, pas un fourre-tout.
 *
 * ## Ce qu'elle NE vérifie PAS
 *
 * Que le DÉCOUPAGE INTERNE soit juste. Que `Order` soit dans
 * `public/orders.prisma` plutôt que dans `public/pricing.prisma` relève du sens,
 * et aucune règle mécanique ne le dira. La porte tient la frontière que Postgres
 * connaît ; le reste est de la relecture, et c'est assumé.
 *
 * Usage : `pnpm lint:prisma-schema-layout` (branché dans `lint:gates`).
 */
import { readFileSync } from "node:fs";
import { relative, sep } from "node:path";

import { PRISMA_SCHEMA_DIR, prismaSchemaFiles, prismaSchemaSource } from "./lib/prisma-schema.mjs";

const ROOT = process.cwd();

/** Le fichier racine : generator + datasource, aucun modèle. */
const ROOT_FILE = "datasource.prisma";

/** Les schémas que le `datasource` déclare — lus, jamais recopiés. */
function declaredSchemas() {
  const found = /schemas\s*=\s*\[([^\]]*)\]/u.exec(prismaSchemaSource(ROOT));
  if (found === null) {
    fail([`Aucun \`schemas = [...]\` dans ${PRISMA_SCHEMA_DIR} — rien à ranger contre.`]);
  }
  return [...found[1].matchAll(/"([^"]+)"/gu)].map((match) => match[1]);
}

/**
 * Le schéma qu'un emplacement ANNONCE : le dossier s'il y en a un,
 * le nom du fichier sinon. `public/orders.prisma` → `public` ;
 * `growth.prisma` → `growth`.
 */
function announcedSchema(relativePath) {
  const parts = relativePath.split(sep);
  return parts.length > 1 ? parts[0] : parts[0].replace(/\.prisma$/u, "");
}

/** Les couples bloc → `@@schema` d'un fichier, dans l'ordre de lecture. */
function blocksOf(source) {
  const blocks = [];
  let current = null;
  for (const line of source.split("\n")) {
    if (current === null) {
      const start = /^(model|enum|type|view)\s+(\w+)/u.exec(line);
      if (start !== null) {
        current = { kind: start[1], name: start[2], schema: null };
      }
      continue;
    }
    const schema = /@@schema\("([^"]+)"\)/u.exec(line);
    if (schema !== null) {
      current.schema = schema[1];
    }
    if (line === "}") {
      blocks.push(current);
      current = null;
    }
  }
  return blocks;
}

const SCHEMAS = declaredSchemas();
const problems = [];
const seen = new Set();

for (const file of prismaSchemaFiles(ROOT)) {
  const path = relative(`${ROOT}/${PRISMA_SCHEMA_DIR}`, file);
  const blocks = blocksOf(readFileSync(file, "utf8"));

  if (path === ROOT_FILE) {
    for (const block of blocks) {
      problems.push(`${path} — ${block.kind} ${block.name} : la racine ne porte aucun modèle.`);
    }
    continue;
  }

  const announced = announcedSchema(path);
  if (!SCHEMAS.includes(announced)) {
    problems.push(
      `${path} — annonce le schéma \`${announced}\`, que le \`datasource\` ne déclare pas.`,
    );
    continue;
  }
  seen.add(announced);

  for (const block of blocks) {
    if (block.schema === null) {
      // Prisma refuse déjà ce cas en mode multi-schémas ; on le dit quand même,
      // parce qu'ici le message nomme le rangement plutôt que la compilation.
      problems.push(`${path} — ${block.kind} ${block.name} : aucun \`@@schema\`.`);
    } else if (block.schema !== announced) {
      problems.push(
        `${path} — ${block.kind} ${block.name} déclare \`@@schema("${block.schema}")\` ` +
          `alors que son emplacement annonce \`${announced}\`.`,
      );
    }
  }
}

for (const schema of SCHEMAS) {
  if (!seen.has(schema)) {
    problems.push(
      `Le schéma \`${schema}\` est déclaré par le \`datasource\` mais aucun fichier ` +
        `\`${schema}.prisma\` ni dossier \`${schema}/\` ne le porte.`,
    );
  }
}

if (problems.length > 0) {
  fail(problems);
}

console.log("✓ prisma-schema-layout : le rangement des sources dit la vérité.");
console.log(`  · ${String(SCHEMAS.length)} schéma(s) déclaré(s), tous rangés à leur nom`);
console.log(`  · ${String(prismaSchemaFiles(ROOT).length)} fichier(s) .prisma`);

function fail(lines) {
  console.error("\n❌ Le rangement des sources Prisma ne dit pas la vérité.\n");
  for (const line of lines) {
    console.error(`   ${line}`);
  }
  console.error(
    "\n   Prisma se moque de l'emplacement : c'est `@@schema` qui décide, et une\n" +
      "   arborescence fausse trompe d'autant mieux qu'elle a l'air rangée.\n",
  );
  process.exit(1);
}
