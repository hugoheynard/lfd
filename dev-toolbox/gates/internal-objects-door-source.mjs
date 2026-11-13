/**
 * La lecture de source dont `internal-objects-door.mjs` a besoin : retirer
 * les commentaires, trouver la parenthèse ou l'accolade qui ferme, couper les
 * arguments d'un appel au premier niveau. Volontairement petite : une
 * construction qu'elle ne sait pas lire fait échouer la porte, elle ne
 * l'interprète pas.
 */

const OPEN = new Set(["(", "[", "{"]);
const CLOSE = new Set([")", "]", "}"]);
const QUOTES = new Set(['"', "'", "`"]);

/** Commentaires retirés. `//` précédé de `:` (une URL) n'en est pas un. */
export function withoutComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/(^|[^:])\/\/.*$/gmu, "$1");
}

/** L'index juste après la chaîne qui commence en `start` (guillemets ou gabarit, sans imbrication). */
function afterString(text, start) {
  const quote = text[start];
  let index = start + 1;
  while (index < text.length && text[index] !== quote) {
    index += text[index] === "\\" ? 2 : 1;
  }
  return index + 1;
}

/**
 * L'index du délimiteur qui ferme celui ouvert en `open` (`(`, `[` ou `{`),
 * chaînes sautées ; `-1` si le source s'arrête avant.
 */
export function closingIndex(text, open) {
  let depth = 0;
  let index = open;
  while (index < text.length) {
    const char = text[index];
    if (QUOTES.has(char)) {
      index = afterString(text, index);
      continue;
    }
    if (OPEN.has(char)) depth += 1;
    if (CLOSE.has(char)) depth -= 1;
    if (depth === 0) return index;
    index += 1;
  }
  return -1;
}

/** Les arguments, au premier niveau, de l'appel dont la parenthèse ouvre en `open` ; `null` si illisible. */
export function callArguments(text, open) {
  const close = closingIndex(text, open);
  if (close === -1) return null;
  const args = [];
  let depth = 0;
  let from = open + 1;
  let index = open + 1;
  while (index < close) {
    const char = text[index];
    if (QUOTES.has(char)) {
      index = afterString(text, index);
      continue;
    }
    if (OPEN.has(char)) depth += 1;
    if (CLOSE.has(char)) depth -= 1;
    if (char === "," && depth === 0) {
      args.push(text.slice(from, index).trim());
      from = index + 1;
    }
    index += 1;
  }
  const last = text.slice(from, close).trim();
  if (last !== "") args.push(last);
  return args;
}

/** Le corps `{…}` qui suit `from` (la première accolade), ou `null`. */
export function bodyAfter(text, from) {
  const open = text.indexOf("{", from);
  if (open === -1) return null;
  const close = closingIndex(text, open);
  return close === -1 ? null : text.slice(open + 1, close);
}

/** Les expressions des `return` d'un corps (le mot `return` retiré). */
export function returnsOf(body) {
  return [...body.matchAll(/\breturn\b\s*([^;]*)/gu)].map((match) => match[1].trim());
}

/** Le fichier importé sous `name` par un import relatif, ou `null` (absent, non relatif). */
export function importedPathOf(source, name) {
  for (const match of source.matchAll(
    /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/gu,
  )) {
    const names = match[1].split(",").map((part) =>
      part
        .trim()
        .replace(/^type\s+/u, "")
        .split(/\s+as\s+/u)
        .at(-1),
    );
    if (names.includes(name) && match[2].startsWith(".")) {
      return match[2].replace(/\.js$/u, ".ts");
    }
  }
  return null;
}
