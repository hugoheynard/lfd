#!/usr/bin/env node
/**
 * Gate : **chaque route d'écriture dit pourquoi un rejeu ne la refait pas**
 * (plan `documentation/ops/plan-idempotence-des-ecritures.md`, J0 ;
 * corrections de vitruve, § 7).
 *
 * Chaque méthode `@Post`, `@Put`, `@Patch`, `@Delete` d'un `*.controller.ts`
 * de `apps/lfd-api/src` est rangée dans une case :
 *
 * - **par nature, par sa propre clé, par la machine, webhook** :
 *   `@Idempotent("raison")`, raison non vide. La porte vérifie qu'elle existe,
 *   pas qu'elle est vraie (§ 7 : déclaratif, relu en revue) ;
 * - **par intention** : `@IntentKey()` dans la signature, ET le handler
 *   atteint appelle `OncePerIntent.runSealed` — ou `run`, seulement si ce
 *   handler n'écrit pas en base (heuristique ci-dessous). Une requête
 *   (`new XQuery(...)`) exécutée par la même route — la relecture après
 *   l'écriture — n'est pas une commande et ne compte pas ;
 * - **risque assumé** : `@AcceptedReplay("raison", "décidé par …")`, les deux
 *   non vides. Un rejeu peut refaire le geste, et quelqu'un l'a décidé : la
 *   porte les liste à chaque exécution, une liste qui se lit, pas une dette.
 *
 * Le handler se résout sans liste : la classe passée en `new X(...)` à un
 * `.execute(` du contrôleur, son fichier lu par l'import, puis la classe
 * `@CommandHandler(X)` qui importe X du même fichier (repli : le nom, s'il
 * n'a qu'un handler). Une requête, un appel de service, un handler
 * introuvable : la route n'est pas « par intention ».
 *
 * **« N'écrit pas en base »**, heuristique écrite ici parce qu'elle décide :
 * le constructeur du handler n'injecte ni `UnitOfWork`, ni `PrismaService`,
 * ni un type en `*Repository`, `*Store` ou `*Writer`, et la classe n'appelle
 * ni `.save(` ni `$transaction(`. `run` résout l'intention hors de la
 * transaction du geste : une panne entre les deux laisse le bail expirer et le
 * rejeu réexécute (§ 7) — d'où `runSealed` dès qu'une écriture existe.
 *
 * ## Ce que la porte refuse
 *
 * 1. une route ni rangée ni inscrite dans `write-idempotence-debt.json` ;
 * 2. une route rangée (ou disparue) encore inscrite dans la dette ;
 * 3. un `@Idempotent()` sans raison, un `@AcceptedReplay()` sans raison ou
 *    sans décision ;
 * 4. `runSealed` dans un fichier qui ouvre `$transaction(` en direct :
 *    `seal` ne scelle que sous `UnitOfWork`, ailleurs la résolution part hors
 *    de la transaction sans erreur (§ 7) ;
 * 5. un `POST` `@Idempotent` dont le handler crée, envoie un e-mail ou
 *    appelle le réseau, hors des exceptions datées (§ 8, J4 ;
 *    `write-idempotence-effects.mjs`).
 *
 * Usage : `pnpm gate write-idempotence` ; `--write-debt` réécrit la liste de
 * dette avec les routes non rangées d'aujourd'hui ; `--inventory [fichier]`
 * écrit l'inventaire JSON des routes rangées (sur la sortie sans fichier),
 * que l'e2e de rejeu lit (`apps/lfd-api/test/write-replay.e2e-spec.ts`). Tests :
 * `node --test dev-toolbox/__tests__/write-idempotence.test.mjs`.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

import {
  EXCEPTIONS_FILE,
  effectsOf,
  natureFailures,
  networkTypes,
} from "./write-idempotence-effects.mjs";
import { inventoryOf } from "./write-idempotence-inventory.mjs";
import {
  WRITE_VERBS,
  decoratorOf,
  decoratorsOf,
  joinRoutePath,
  pathConstants,
  prefixOf,
  verbOf,
} from "./write-idempotence-paths.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = "apps/lfd-api/src";
export const DEBT_FILE = "dev-toolbox/gates/write-idempotence-debt.json";

const WRITING_INJECTIONS = /^(?:UnitOfWork|PrismaService)$|(?:Repository|Store|Writer)$/;

const parse = (path, source) =>
  ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

const lineOf = (file, node) => file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;

/** La raison d'un `@Idempotent(...)` : `null` sans décorateur, `""` si vide ou non littérale. */
function reasonOf(method) {
  for (const decorator of decoratorsOf(method)) {
    const { name, args } = decoratorOf(decorator);
    if (name !== "Idempotent") continue;
    const [first] = args;
    if (first && (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first))) {
      return first.text.trim();
    }
    return "";
  }
  return null;
}

/**
 * Le risque assumé d'un `@AcceptedReplay(raison, décision)` : `null` sans
 * décorateur, `""` si l'un des deux manque, est vide ou n'est pas littéral.
 */
function acceptedReplayOf(method) {
  for (const decorator of decoratorsOf(method)) {
    const { name, args } = decoratorOf(decorator);
    if (name !== "AcceptedReplay") continue;
    const texts = args
      .filter((arg) => ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))
      .map((arg) => arg.text.trim());
    if (texts.length !== 2 || texts.some((text) => text === "")) return "";
    return `${texts[0]} (${texts[1]})`;
  }
  return null;
}

const readsIntentKey = (method) =>
  method.parameters.some((parameter) =>
    decoratorsOf(parameter).some((decorator) => decoratorOf(decorator).name === "IntentKey"),
  );

/**
 * Les classes construites en argument d'un `.execute(` dans le corps, et dans
 * les méthodes de la même classe qu'il appelle par `this.x(` (une route qui
 * délègue à sa voisine).
 */
function executedClasses(method, siblings, seen = new Set()) {
  const found = [];
  seen.add(method);
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const callee = node.expression;
      if (callee.name.text === "execute") {
        for (const argument of node.arguments) {
          if (ts.isNewExpression(argument) && ts.isIdentifier(argument.expression)) {
            found.push(argument.expression.text);
          }
        }
      }
      const sibling =
        callee.expression.kind === ts.SyntaxKind.ThisKeyword
          ? siblings.get(callee.name.text)
          : undefined;
      if (sibling && !seen.has(sibling)) found.push(...executedClasses(sibling, siblings, seen));
    }
    ts.forEachChild(node, visit);
  };
  if (method.body) visit(method.body);
  return found;
}

/** Nom importé → fichier `.ts` résolu (imports relatifs seulement). */
export function importsOf(path, file) {
  const map = new Map();
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    const specifier = statement.moduleSpecifier.text;
    if (!specifier.startsWith(".")) continue;
    const target = join(dirname(path), specifier).replace(/\.js$/, ".ts");
    const named = statement.importClause?.namedBindings;
    if (named && ts.isNamedImports(named)) {
      for (const element of named.elements) map.set(element.name.text, target);
    }
  }
  return map;
}

/** Les routes d'écriture d'un contrôleur. */
export function writeRoutes(path, source) {
  const file = parse(path, source);
  const imports = importsOf(path, file);
  const constants = pathConstants(file);
  const routes = [];
  const visit = (node) => {
    if (ts.isClassDeclaration(node)) {
      const guards = decoratorsOf(node).map((d) => d.getText(file));
      const prefix = prefixOf(node, constants);
      const siblings = new Map(
        node.members
          .filter((member) => ts.isMethodDeclaration(member) && member.name)
          .map((member) => [member.name.getText(file), member]),
      );
      for (const member of node.members) {
        if (!ts.isMethodDeclaration(member) || !member.name) continue;
        const names = decoratorsOf(member).map((d) => decoratorOf(d).name);
        if (!names.some((name) => WRITE_VERBS.has(name))) continue;
        const own = decoratorsOf(member).map((d) => d.getText(file));
        const { verb, path: ownPath } = verbOf(member, constants);
        routes.push({
          file: path,
          method: member.name.getText(file),
          httpMethod: verb,
          path: joinRoutePath(prefix, ownPath),
          line: lineOf(file, member),
          reason: reasonOf(member),
          accepted: acceptedReplayOf(member),
          intentKey: readsIntentKey(member),
          commands: executedClasses(member, siblings).map((name) => ({
            name,
            from: imports.get(name) ?? path,
          })),
          machine: [...guards, ...own].some((text) => /\bRecomputeGuard\b/.test(text)),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return routes;
}

/** Le type nommé d'un paramètre de constructeur (`UnitOfWork`, `OncePerIntent`…). */
const typeName = (parameter) =>
  parameter.type && ts.isTypeReferenceNode(parameter.type)
    ? parameter.type.typeName.getText()
    : null;

/** Ce qu'une classe handler fait de `OncePerIntent`, et si elle écrit en base. */
function handlerTraits(file, node, network) {
  const constructor = node.members.find(ts.isConstructorDeclaration);
  const injected = (constructor?.parameters ?? []).map((p) => ({
    field: p.name.getText(file),
    type: typeName(p),
  }));
  const text = node.getText(file);
  const intentFields = injected.filter((p) => p.type === "OncePerIntent").map((p) => p.field);
  const calls = (verb) =>
    intentFields.some((field) =>
      new RegExp(`this\\.${field}\\s*\\.\\s*${verb}\\s*[<(]`).test(text),
    );
  return {
    effects: effectsOf(injected, text, network),
    sealed: calls("runSealed"),
    run: calls("run"),
    writes:
      injected.some((p) => p.type !== null && WRITING_INJECTIONS.test(p.type)) ||
      /\.save\s*\(|\$transaction\s*\(/.test(text),
  };
}

/** Les `@CommandHandler(X)` d'un fichier : `{ command, from, file, …traits }`. */
export function commandHandlersIn(path, source, network = new Set()) {
  if (!source.includes("@CommandHandler")) return [];
  const file = parse(path, source);
  const imports = importsOf(path, file);
  const found = [];
  const visit = (node) => {
    if (ts.isClassDeclaration(node)) {
      for (const decorator of decoratorsOf(node)) {
        const { name, args } = decoratorOf(decorator);
        const [first] = args;
        if (name !== "CommandHandler" || !first || !ts.isIdentifier(first)) continue;
        found.push({
          name: node.name?.text ?? null,
          command: first.text,
          from: imports.get(first.text) ?? path,
          file: path,
          ...handlerTraits(file, node, network),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

/** Le handler de la commande : par son fichier d'abord, par son nom s'il est seul. */
export function handlerFor(command, handlers) {
  const exact = handlers.find((h) => h.command === command.name && h.from === command.from);
  if (exact) return exact;
  const named = handlers.filter((h) => h.command === command.name);
  return named.length === 1 ? named[0] : null;
}

/** Une requête de lecture (`XQuery`) : la relecture après l'écriture, pas une commande. */
const isQuery = (command) => /Query$/.test(command.name);

/**
 * La case d'une route : `nature`, `intent`, `accepted`, `empty-reason`, ou
 * `null` (non rangée).
 */
export function caseOf(route, handlers) {
  if (route.reason !== null) return route.reason === "" ? "empty-reason" : "nature";
  const accepted = route.accepted ?? null;
  if (accepted !== null) return accepted === "" ? "empty-reason" : "accepted";
  const commands = route.commands.filter((command) => !isQuery(command));
  if (!route.intentKey || commands.length === 0) return null;
  const reached = commands.map((command) => handlerFor(command, handlers));
  const sealedOrHarmless = (h) => h !== null && (h.sealed || (h.run && !h.writes));
  return reached.every(sealedOrHarmless) ? "intent" : null;
}

/** Un `runSealed` sous une transaction ouverte en direct. */
export const sealedUnderDirectTransaction = (source) =>
  /\.runSealed\s*[<(]/.test(source) && /\$transaction\s*\(/.test(source);

const key = (entry) => `${entry.file}#${entry.method}`;

/**
 * Le verdict : `{ failures, ranged, debt }`. `routes` sont déjà classées
 * (`case`), `debt` est la liste inscrite, `sealedFiles` les fichiers fautifs (4).
 */
export function verdict(routes, debt, sealedFiles = []) {
  const failures = [];
  const inDebt = new Set(debt.map(key));
  const known = new Map(routes.map((route) => [key(route), route]));
  for (const route of routes) {
    const where = `${route.file}:${route.line}  ${route.method}`;
    if (route.case === "empty-reason") {
      failures.push(
        `${where} — @Idempotent() sans raison, ou @AcceptedReplay() sans raison ou sans décision : nommer le mécanisme, ou le risque et qui l'a décidé`,
      );
    } else if (route.case === null && !inDebt.has(key(route))) {
      failures.push(
        `${where} — route d'écriture non rangée : @Idempotent("raison"), ou @IntentKey() et un handler en OncePerIntent.runSealed`,
      );
    } else if (route.case !== null && inDebt.has(key(route))) {
      failures.push(
        `${where} — rangée (${route.case}) mais encore dans ${DEBT_FILE} : l'en retirer`,
      );
    }
  }
  for (const entry of debt) {
    if (!known.has(key(entry))) {
      failures.push(
        `${entry.file}  ${entry.method} — inscrite dans ${DEBT_FILE}, plus aucune route d'écriture : l'en retirer`,
      );
    }
  }
  for (const file of sealedFiles) {
    failures.push(
      `${file} — runSealed dans un fichier qui ouvre $transaction( en direct : seal ne scelle que sous UnitOfWork`,
    );
  }
  const ranged = routes.filter((route) => ["nature", "intent", "accepted"].includes(route.case));
  return { failures, ranged, debt: routes.filter((route) => route.case === null) };
}

/** La liste de dette à écrire : fichier et méthode, triés. */
export const debtOf = (routes) =>
  routes
    .filter((route) => route.case === null)
    .map((route) => ({ file: route.file, method: route.method }))
    .sort((a, b) => key(a).localeCompare(key(b)));

function typescriptFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== "__tests__" && entry !== "node_modules") out.push(...typescriptFiles(full));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".spec.ts")) {
      out.push(full);
    }
  }
  return out;
}

function main(argv) {
  const files = typescriptFiles(join(ROOT, SRC)).map((full) => ({
    path: relative(ROOT, full),
    source: readFileSync(full, "utf8"),
  }));
  const network = networkTypes(files);
  const handlers = files.flatMap(({ path, source }) => commandHandlersIn(path, source, network));
  const routes = files
    .filter(({ path }) => path.endsWith(".controller.ts"))
    .flatMap(({ path, source }) => writeRoutes(path, source))
    .map((route) => ({ ...route, case: caseOf(route, handlers) }));
  const sealedFiles = files
    .filter(({ source }) => sealedUnderDirectTransaction(source))
    .map(({ path }) => path);

  const inventoryAt = argv.indexOf("--inventory");
  if (inventoryAt !== -1) {
    const target = argv[inventoryAt + 1];
    const content = `${JSON.stringify(
      inventoryOf(routes, (command) => handlerFor(command, handlers)),
      null,
      2,
    )}\n`;
    if (target && !target.startsWith("--")) writeFileSync(resolve(target), content);
    else process.stdout.write(content);
    return;
  }

  if (argv.includes("--write-debt")) {
    const content = {
      $comment:
        "Les routes d'écriture pas encore rangées (pnpm gate write-idempotence). Une dette qui ne peut que décroître : régénérer par `node dev-toolbox/gates/write-idempotence.mjs --write-debt`, jamais à la main pour ajouter.",
      routes: debtOf(routes),
    };
    writeFileSync(join(ROOT, DEBT_FILE), `${JSON.stringify(content, null, 2)}\n`);
    console.log(
      `write-idempotence : ${content.routes.length} route(s) inscrite(s) dans ${DEBT_FILE}.`,
    );
  }

  const debt = JSON.parse(readFileSync(join(ROOT, DEBT_FILE), "utf8")).routes;
  const result = verdict(routes, debt, sealedFiles);
  const exceptions = JSON.parse(readFileSync(join(ROOT, EXCEPTIONS_FILE), "utf8")).exceptions;
  result.failures.push(
    ...natureFailures(routes, (command) => handlerFor(command, handlers), exceptions),
  );
  if (result.failures.length > 0) {
    console.error("\n✗ write-idempotence\n");
    for (const failure of result.failures) console.error(`  ${failure}`);
    console.error(
      `\n  ${result.failures.length} faute(s). Plan : documentation/ops/plan-idempotence-des-ecritures.md\n`,
    );
    process.exit(1);
  }
  const count = (name) => result.ranged.filter((route) => route.case === name).length;
  const machine = result.ranged.filter((route) => route.machine).length;
  console.log(
    `✓ write-idempotence : ${routes.length} route(s) d'écriture, ${result.ranged.length} rangée(s) ` +
      `(${count("intent")} par intention, ${count("nature")} par @Idempotent dont ${machine} sous RecomputeGuard, ` +
      `${count("accepted")} en risque assumé).\n` +
      `  Dette : ${result.debt.length} route(s) non rangée(s) (${DEBT_FILE}) — compté, pas ignoré.`,
  );
  console.log(
    `  POST « par nature » à effet, en exception datée (${EXCEPTIONS_FILE}) : ${exceptions.length}.`,
  );
  for (const route of result.ranged.filter((r) => r.case === "accepted")) {
    console.log(`  Risque assumé : ${route.file}  ${route.method} — ${route.accepted}`);
  }
  const byFile = new Map();
  for (const route of result.debt) byFile.set(route.file, (byFile.get(route.file) ?? 0) + 1);
  for (const [file, n] of [...byFile].sort((a, b) => b[1] - a[1])) console.log(`    ${n}  ${file}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
