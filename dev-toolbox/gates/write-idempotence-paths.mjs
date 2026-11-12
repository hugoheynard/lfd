/**
 * Les décorateurs d'une route d'écriture, pour la porte `write-idempotence` :
 * leur nom, et le chemin HTTP qu'ils écrivent (l'inventaire, `--inventory`, plan
 * `documentation/ops/l-idempotence-des-ecritures.md`, § 8, J3).
 *
 * Lit `@Controller(...)` et le verbe : un littéral, une constante du fichier
 * (ou un gabarit qui en compose), le `path` d'un objet littéral. Ce qui ne se
 * résout pas dans le fichier (une constante importée) s'écrit `{NOM}`. Les
 * préfixes montés par un `RouterModule` ne se lisent pas ici.
 */
import ts from "typescript";

export const WRITE_VERBS = new Set(["Post", "Put", "Patch", "Delete"]);

/** Le nom d'un décorateur (`@Post()` → `Post`), et son premier argument. */
export function decoratorOf(decorator) {
  const expression = decorator.expression;
  if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression)) {
    return { name: expression.expression.text, args: expression.arguments };
  }
  if (ts.isIdentifier(expression)) {
    return { name: expression.text, args: [] };
  }
  return { name: null, args: [] };
}

export const decoratorsOf = (node) =>
  ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];

/** Les constantes de chemin du fichier : `const X = "…"` ou un gabarit qui en compose. */
export function pathConstants(file) {
  const constants = new Map();
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
      const text = literalText(declaration.initializer, constants);
      if (text !== null) constants.set(declaration.name.text, text);
    }
  }
  return constants;
}

/** Le texte d'un littéral ou d'un gabarit de constantes connues, `null` sinon. */
function literalText(node, constants) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isIdentifier(node)) return constants.get(node.text) ?? null;
  if (!ts.isTemplateExpression(node)) return null;
  let text = node.head.text;
  for (const span of node.templateSpans) {
    const value = literalText(span.expression, constants);
    if (value === null) return null;
    text += value + span.literal.text;
  }
  return text;
}

/**
 * Le chemin écrit dans un décorateur de route : un littéral (ou une constante
 * du fichier), `path` d'un objet littéral, `""` sans argument, `{NOM}` pour ce
 * qui ne se résout pas dans le fichier.
 */
function pathArgument(args, constants) {
  const [first] = args;
  if (!first) return "";
  const text = literalText(first, constants);
  if (text !== null) return text;
  if (ts.isObjectLiteralExpression(first)) {
    const path = first.properties.find(
      (p) => ts.isPropertyAssignment(p) && p.name.getText() === "path",
    );
    return path ? pathArgument([path.initializer], constants) : "";
  }
  return `{${first.getText()}}`;
}

/** Le verbe HTTP et le chemin propre d'une méthode de contrôleur. */
export function verbOf(member, constants) {
  for (const decorator of decoratorsOf(member)) {
    const { name, args } = decoratorOf(decorator);
    if (WRITE_VERBS.has(name))
      return { verb: name.toUpperCase(), path: pathArgument(args, constants) };
  }
  return { verb: null, path: "" };
}

/** Le préfixe `@Controller(...)` d'une classe. */
export function prefixOf(node, constants) {
  for (const decorator of decoratorsOf(node)) {
    const { name, args } = decoratorOf(decorator);
    if (name === "Controller") return pathArgument(args, constants);
  }
  return "";
}

/** Le chemin complet d'une route : `/préfixe/chemin`, sans double barre. */
export const joinRoutePath = (prefix, path) =>
  `/${[prefix, path]
    .map((part) => part.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/")}`;
