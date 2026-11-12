/**
 * La lecture d'un fichier d'écran pour la porte `front-intent-keys` : ses
 * appels HTTP d'écriture (verbe, chemin reconstitué, porte-t-il la clé
 * d'intention ?) et ses clés tirées au hasard (plan
 * `documentation/ops/l-idempotence-des-ecritures.md`, § 8, J5).
 *
 * **Le chemin** se reconstitue dans le fichier seul : un gabarit
 * `` `${this.base}/phones/${id}` `` remplace `this.base` (ou une constante,
 * une variable locale) par son initialiseur s'il est une chaîne, et laisse un
 * joker pour le reste — l'identifiant d'une ressource, la base de l'API.
 * Un joker en tête avale tout préfixe : la base de l'API, et le `/pim` qu'un
 * `RouterModule` monte côté API, que l'inventaire ne lit pas.
 *
 * **La clé** est portée quand un argument de l'appel (après le chemin) passe
 * par `intentOptions(`, `withIntent(` ou `INTENT_KEY_HEADER` — directement,
 * par une variable locale de la même fonction, ou par une méthode de la même
 * classe (`this.intentHeaders(…)`) dont le corps le fait.
 */
import ts from "typescript";

const WRITE_VERBS = new Map([
  ["post", "POST"],
  ["put", "PUT"],
  ["patch", "PATCH"],
  ["delete", "DELETE"],
]);

/** Ce qui, dans un argument, dit « cette requête porte la clé d'une intention ». */
export const KEY_MARKERS = /\bintentOptions\s*\(|\bwithIntent\s*\(|\bINTENT_KEY_HEADER\b/;

/** Un receveur HTTP : `http`, `this.http`, `this.httpClient`… */
const isHttpReceiver = (text) => /(?:^|\.)http(?:Client)?$/i.test(text);

export const parse = (path, source) =>
  ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

const lineOf = (file, node) => file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;

/** `nom → initialiseur` des constantes, variables et propriétés de classe du fichier. */
function initializersOf(file) {
  const map = new Map();
  const counts = new Map();
  const visit = (node) => {
    let name = null;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      name = node.name.text;
    } else if (ts.isPropertyDeclaration(node) && node.initializer && node.name) {
      name = `this.${node.name.getText(file)}`;
    } else if (ts.isMethodDeclaration(node) && node.name && node.body) {
      name = `this.${node.name.getText(file)}`;
    } else if (ts.isFunctionDeclaration(node) && node.name && node.body) {
      name = node.name.text;
    }
    if (name !== null) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
      map.set(name, node.initializer ?? node);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  // Un nom déclaré deux fois (deux fonctions, deux `url`) ne se résout pas.
  for (const [name, n] of counts) if (n > 1) map.delete(name);
  return map;
}

/**
 * Le texte d'une expression de chemin : morceaux littéraux et jokers (`*`).
 * `bound` lie les paramètres d'une fonction de chemin aux morceaux de ses
 * arguments (`this.url(`products/${id}`)`).
 */
function pathPieces(node, initializers, depth = 0, bound = new Map()) {
  if (depth > 6) return ["*"];
  const recurse = (child, next = bound) => pathPieces(child, initializers, depth + 1, next);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
  if (ts.isParenthesizedExpression(node)) return recurse(node.expression);
  if (ts.isTemplateExpression(node)) {
    const pieces = [node.head.text];
    for (const span of node.templateSpans)
      pieces.push(...recurse(span.expression), span.literal.text);
    return pieces;
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return [...recurse(node.left), ...recurse(node.right)];
  }
  if (ts.isIdentifier(node) && bound.has(node.text)) return bound.get(node.text);
  // Un chemin fabriqué par une fonction du fichier (`this.base(id)`) : ce
  // qu'elle rend, ses paramètres liés aux arguments de l'appel.
  const name = (ts.isCallExpression(node) ? node.expression : node).getText();
  const declared = initializers.get(name);
  const target = returnedBy(declared);
  if (!target) return ["*"];
  if (!ts.isCallExpression(node) || !ts.isFunctionLike(declared)) return recurse(target, new Map());
  const params = new Map(
    declared.parameters
      .filter((parameter) => ts.isIdentifier(parameter.name))
      .map((parameter, index) => [
        parameter.name.text,
        node.arguments[index] ? recurse(node.arguments[index]) : ["*"],
      ]),
  );
  return recurse(target, params);
}

/** L'expression d'un initialiseur, ou ce que rend une fonction à `return` unique. */
function returnedBy(node) {
  if (!node || !ts.isFunctionLike(node)) return node;
  if (node.body && !ts.isBlock(node.body)) return node.body;
  const returns = (node.body?.statements ?? []).filter(ts.isReturnStatement);
  return returns.length === 1 ? returns[0].expression : undefined;
}

/**
 * Ce qu'un joker de tête peut valoir : l'origine de l'API (vide dans le
 * chemin), ou `/pim` quand la base du référentiel le porte (`API_BASE_URL`
 * du back-office). Un joker de tête plus large rattacherait `/lines` à toute
 * route qui finit ainsi.
 */
const LEADING = "(?:/pim)?";

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * L'expression régulière d'un chemin reconstitué, à tester contre le chemin
 * d'une route de l'inventaire (`:param`, `{NOM}` et un joker du milieu y
 * valent UN segment : plus large, `/staff-users/${id}` désignerait
 * `/staff-users/:id/status`).
 * `null` si le chemin n'a aucun morceau littéral : il ne désigne rien.
 */
export function pathPattern(pieces) {
  const joined = [];
  for (const piece of pieces) {
    if (piece === "" || (piece === "*" && joined.at(-1) === "*")) continue;
    joined.push(piece);
  }
  const literal = joined.filter((piece) => piece !== "*").join("");
  if (!literal.includes("/")) return null;
  const parts = joined.map((piece, index) => {
    if (piece !== "*") return escape(piece.split("?")[0]);
    return index === 0 ? LEADING : "[^/]+";
  });
  // Une chaîne de requête (`?x=…`) coupe le chemin : ce qui suit ne compte pas.
  const cut = joined.findIndex((piece) => piece !== "*" && piece.includes("?"));
  const kept = cut === -1 ? parts : parts.slice(0, cut + 1);
  return new RegExp(`^${kept.join("")}$`);
}

/** Les corps des fonctions qui contiennent le nœud, de la plus proche à la méthode. */
function enclosingBodies(node) {
  const bodies = [];
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isFunctionLike(current) && current.body) bodies.push(current.body);
    if (ts.isClassDeclaration(current)) break;
  }
  return bodies;
}

/** Les méthodes de la classe qui contient le nœud, par nom. */
function siblingMethods(node, file) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isClassDeclaration(current)) {
      return new Map(
        current.members
          .filter((member) => ts.isMethodDeclaration(member) && member.name && member.body)
          .map((member) => [member.name.getText(file), member.body.getText(file)]),
      );
    }
  }
  return new Map();
}

/** Un argument porte-t-il la clé, lui ou ce qu'il désigne dans le fichier ? */
function carriesKey(argument, call, file) {
  const text = argument.getText(file);
  if (KEY_MARKERS.test(text)) return true;
  const methods = siblingMethods(call, file);
  for (const match of text.matchAll(/this\.(\w+)\s*\(/g)) {
    if (KEY_MARKERS.test(methods.get(match[1]) ?? "")) return true;
  }
  // Une variable de la fonction (`options`, `{ headers }`) : sa déclaration.
  const scope = enclosingBodies(call)
    .map((body) => body.getText(file))
    .join("\n");
  for (const name of new Set(text.match(/\b[A-Za-z_]\w*\b/g) ?? [])) {
    const declared = new RegExp(`\\b(?:const|let)\\s+${escape(name)}\\b[^;]*`, "g");
    for (const match of scope.matchAll(declared)) {
      if (KEY_MARKERS.test(match[0])) return true;
    }
  }
  return false;
}

/**
 * Verbe et arguments d'un appel HTTP d'écriture, ou `null`. `wrapper` : un
 * `this.post(url, …)` de la classe, qui enveloppe `http.post`.
 */
function writeCall(node, file) {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return null;
  const callee = node.expression;
  const name = callee.name.text;
  const receiver = callee.expression.getText(file);
  const [first, ...others] = node.arguments;
  if (WRITE_VERBS.has(name) && first && (isHttpReceiver(receiver) || receiver === "this")) {
    return { verb: WRITE_VERBS.get(name), url: first, rest: others, wrapper: receiver === "this" };
  }
  const [url, ...rest] = others;
  if (
    name === "request" &&
    (isHttpReceiver(receiver) || receiver === "this") &&
    first &&
    ts.isStringLiteral(first) &&
    WRITE_VERBS.has(first.text.toLowerCase()) &&
    url
  ) {
    return { verb: first.text.toUpperCase(), url, rest, wrapper: false };
  }
  return null;
}

/**
 * Un `this.post(url, corps, clé)` porte la clé quand la méthode enveloppe la
 * pose (`withIntent`, `intentOptions`) et qu'un argument la nomme.
 */
function wrapperCarriesKey(call, node, file) {
  const method = siblingMethods(node, file).get(node.expression.name.text) ?? "";
  return (
    KEY_MARKERS.test(method) &&
    call.rest.some((argument) => /key|intent/i.test(argument.getText(file)))
  );
}

/** Les appels HTTP d'écriture d'un fichier : `{ line, verb, pattern, keyed }`. */
export function writeCallsOf(path, source) {
  const file = parse(path, source);
  const initializers = initializersOf(file);
  const calls = [];
  const visit = (node) => {
    const call = writeCall(node, file);
    if (call !== null) {
      calls.push({
        line: lineOf(file, node),
        verb: call.verb,
        pattern: pathPattern(pathPieces(call.url, initializers)),
        keyed:
          call.rest.some((argument) => carriesKey(argument, node, file)) ||
          (call.wrapper && wrapperCarriesKey(call, node, file)),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return calls;
}

/** Un nom qui dit « clé d'intention » (`intentKey`, `this.intent`…). */
const INTENT_NAME = /intent/i;

/**
 * Les clés d'intention tirées au hasard hors de la brique : un
 * `randomUUID()` passé à `intentOptions(` / `withIntent(`, posé sous
 * `INTENT_KEY_HEADER` ou `'Idempotency-Key'`, rangé dans un nom en
 * `*intent*`, ou passé tel quel en argument d'un appel (la clé d'un geste
 * que le service pose en en-tête). `{ line }` par clé.
 */
export function drawnKeysOf(path, source) {
  if (!source.includes("randomUUID")) return [];
  const file = parse(path, source);
  const found = [];
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      /(?:^|\.)randomUUID$/.test(node.expression.getText(file)) &&
      drawnAsKey(node, file)
    ) {
      found.push({ line: lineOf(file, node) });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

function drawnAsKey(node, file) {
  const parent = node.parent;
  if (ts.isCallExpression(parent) && parent.arguments.includes(node)) return true;
  if (ts.isPropertyAssignment(parent)) {
    return /INTENT_KEY_HEADER|Idempotency-Key/i.test(parent.name.getText(file));
  }
  if (ts.isVariableDeclaration(parent) || ts.isPropertyDeclaration(parent)) {
    return INTENT_NAME.test(parent.name.getText(file));
  }
  if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
    return INTENT_NAME.test(parent.left.getText(file));
  }
  return false;
}
