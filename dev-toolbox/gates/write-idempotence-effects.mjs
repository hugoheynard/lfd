/**
 * Les effets qu'un handler ne peut pas rejouer sans clé, pour la porte
 * `write-idempotence` (plan `documentation/ops/plan-idempotence-des-ecritures.md`,
 * § 8, J4 : « par nature » resserré).
 *
 * Un `POST` rangé `@Idempotent("raison")` affirme que le rejeu ne refait
 * rien. La porte le refuse quand le handler qu'il atteint :
 *
 * - **crée** : appelle `next(` sur un champ injecté de type `IdGenerator` —
 *   chaque appel est un identifiant neuf, donc une ligne de plus au rejeu ;
 * - **envoie un e-mail** : appelle `send(` ou `sendAndAwaitReceipt(` sur un
 *   champ injecté de type `Mail` ;
 * - **appelle le réseau** : injecte un type que l'un des adaptateurs gardés
 *   par `assertOutsideTransaction(` déclare (la classe, ou ce qu'elle
 *   `implements` / `extends`).
 *
 * La porte ne lit que le handler : un service applicatif qu'il injecte et qui
 * crée à sa place n'est pas suivi. `PUT`, `PATCH`, `DELETE` gardent la raison
 * déclarative. Une exception est écrite, datée et justifiée dans
 * `write-idempotence-exceptions.json` : la création ou l'envoi y est gardé par
 * une clé métier que la raison nomme.
 */
import ts from "typescript";

export const EXCEPTIONS_FILE = "dev-toolbox/gates/write-idempotence-exceptions.json";

const NETWORK_GUARD = /\bassertOutsideTransaction\s*\(/;

/** Les noms de classe et de ce qu'elles implémentent ou étendent, dans un fichier. */
function declaredTypes(file) {
  const names = [];
  const visit = (node) => {
    if (ts.isClassDeclaration(node) && node.name) {
      names.push(node.name.text);
      for (const clause of node.heritageClauses ?? []) {
        for (const type of clause.types) names.push(type.expression.getText(file));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return names;
}

/**
 * Les types qu'un handler injecte pour atteindre le réseau : ceux des fichiers
 * qui appellent la garde (le module de la garde lui-même excepté).
 *
 * @param files `{ path, source }` de `apps/lfd-api/src`.
 */
export function networkTypes(files) {
  const types = new Set();
  for (const { path, source } of files) {
    if (!NETWORK_GUARD.test(source) || /outside-transaction\.ts$/.test(path)) continue;
    const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    for (const name of declaredTypes(file)) types.add(name);
  }
  return types;
}

const callsOn = (text, fields, verbs) =>
  fields.some((field) =>
    verbs.some((verb) => new RegExp(`this\\.${field}\\s*\\.\\s*${verb}\\s*[<(]`).test(text)),
  );

/**
 * Les effets d'une classe handler : `creates`, `mail`, `network:<Type>`.
 *
 * @param injected `{ field, type }` des paramètres du constructeur.
 * @param text le texte de la classe.
 * @param network les types réseau (`networkTypes`).
 */
export function effectsOf(injected, text, network) {
  const fieldsOf = (type) => injected.filter((p) => p.type === type).map((p) => p.field);
  const effects = [];
  if (callsOn(text, fieldsOf("IdGenerator"), ["next"])) effects.push("creates");
  if (callsOn(text, fieldsOf("Mail"), ["send", "sendAndAwaitReceipt"])) effects.push("mail");
  for (const { type } of injected) {
    if (type !== null && network.has(type)) effects.push(`network:${type}`);
  }
  return effects;
}

const EFFECT_WORDS = {
  creates: "crée (ids.next())",
  mail: "envoie un e-mail (mail.send)",
};

/** L'effet en mots, pour le message de la porte. */
export const effectWords = (effect) =>
  EFFECT_WORDS[effect] ?? `appelle le réseau (${effect.replace(/^network:/, "")})`;

/**
 * Les effets non rejouables d'une route `POST` « par nature » : ceux des
 * handlers qu'elle atteint. Vide pour un autre verbe ou une autre case.
 *
 * @param route la route classée de la porte.
 * @param resolveHandler commande → handler (avec `effects`), ou `null`.
 */
export function unreplayableEffects(route, resolveHandler) {
  if (route.case !== "nature" || route.httpMethod !== "POST") return [];
  return route.commands
    .filter((command) => !/Query$/.test(command.name))
    .map(resolveHandler)
    .filter((handler) => handler !== null)
    .flatMap((handler) => handler.effects.map((effect) => ({ handler, effect })));
}

/**
 * Une exception valide : `route` (`fichier#méthode`), `reason` non vide,
 * `verified` au format `AAAA-MM-JJ`.
 */
export const isValidException = (entry) =>
  typeof entry.route === "string" &&
  typeof entry.reason === "string" &&
  entry.reason.trim() !== "" &&
  typeof entry.verified === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(entry.verified);

/**
 * Les fautes de J4 : un `POST` « par nature » qui atteint un effet non
 * rejouable sans exception inscrite ; une exception invalide, ou qui ne
 * désigne plus une telle route.
 *
 * @param routes les routes classées.
 * @param resolveHandler commande → handler, ou `null`.
 * @param exceptions les entrées de `write-idempotence-exceptions.json`.
 */
export function natureFailures(routes, resolveHandler, exceptions) {
  const failures = [];
  const excepted = new Map(exceptions.map((entry) => [entry.route, entry]));
  const offending = new Set();
  for (const route of routes) {
    const effects = unreplayableEffects(route, resolveHandler);
    if (effects.length === 0) continue;
    const id = `${route.file}#${route.method}`;
    offending.add(id);
    if (excepted.has(id)) continue;
    const said = effects
      .map(({ handler, effect }) => `${handler.name} ${effectWords(effect)}`)
      .join(", ");
    failures.push(
      `${route.file}:${route.line}  ${route.method} — POST @Idempotent dont le handler ${said} : ` +
        `un rejeu le refait. @IntentKey() et runSealed, ou une exception datée dans ${EXCEPTIONS_FILE} qui nomme la clé métier`,
    );
  }
  for (const entry of exceptions) {
    if (!isValidException(entry)) {
      failures.push(
        `${EXCEPTIONS_FILE}  ${entry.route ?? "?"} — exception sans raison ou sans date vérifiée (AAAA-MM-JJ)`,
      );
    } else if (!offending.has(entry.route)) {
      failures.push(
        `${EXCEPTIONS_FILE}  ${entry.route} — exception qui ne désigne plus un POST « par nature » à effet : l'en retirer`,
      );
    }
  }
  return failures;
}
