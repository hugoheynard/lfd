/**
 * **Les services qui écrivent**, pour `write-idempotence.mjs` : un handler en
 * `OncePerIntent.run` n'est « sans écriture » que si AUCUN des services qu'il
 * injecte n'écrit en base — sans quoi l'écriture se cache derrière le
 * service, et un rejeu après le bail la refait (l'invitation d'un membre du
 * staff passait ainsi par `OpenStaffAccess`).
 *
 * Un service est une classe `@Injectable()` ; il écrit si son constructeur
 * injecte un type qui écrit, si son texte appelle une écriture, ou s'il
 * injecte un autre service qui écrit (point fixe). Les ports abstraits ne
 * sont pas `@Injectable()` : ils restent jugés par leur nom (`*Repository`…).
 */
import ts from "typescript";

const parse = (path, source) =>
  ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

const isInjectable = (node) =>
  (ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : []).some((decorator) => {
    const call = decorator.expression;
    return ts.isCallExpression(call) && call.expression.getText() === "Injectable";
  });

/**
 * Les classes `@Injectable()` d'un fichier : `{ name, injectedTypes, writes }`,
 * `writes` jugé sur la classe seule (`isWritingType`, `writingCalls`).
 */
export function injectableClassesIn(path, source, isWritingType, writingCalls) {
  if (!source.includes("@Injectable")) return [];
  const file = parse(path, source);
  const found = [];
  const visit = (node) => {
    if (ts.isClassDeclaration(node) && node.name && isInjectable(node)) {
      const constructor = node.members.find(ts.isConstructorDeclaration);
      const injectedTypes = (constructor?.parameters ?? [])
        .map((p) =>
          p.type && ts.isTypeReferenceNode(p.type) ? p.type.typeName.getText(file) : null,
        )
        .filter((type) => type !== null);
      found.push({
        name: node.name.text,
        injectedTypes,
        writes:
          injectedTypes.some((type) => isWritingType(type)) ||
          writingCalls.test(node.getText(file)),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

/** Les noms des services qui écrivent, eux-mêmes ou par un service injecté. */
export function writingServices(classes) {
  const writing = new Set(classes.filter((c) => c.writes).map((c) => c.name));
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of classes) {
      if (!writing.has(c.name) && c.injectedTypes.some((type) => writing.has(type))) {
        writing.add(c.name);
        grew = true;
      }
    }
  }
  return writing;
}
