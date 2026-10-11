/**
 * **Superpose les remplacements publiés au texte du code** — par clé
 * (`cart.whoTitle`, `nav.houseLinks.0.1`), sans jamais créer de chemin.
 *
 * Un remplacement n'est appliqué que si sa clé désigne, dans le dictionnaire,
 * une CHAÎNE qui existe : une clé que cette version de la boutique ne connaît
 * pas (déploiements décalés), qui vise un objet ou une fonction, est ignorée —
 * le texte du code reste (plan `plan-textes-de-la-boutique.md`, §2, §10 B1).
 *
 * Copie seulement le long des chemins touchés : le reste du dictionnaire est
 * partagé, et un dictionnaire sans remplacement est rendu tel quel.
 */
export function overlayCopy<T extends object>(base: T, texts: Readonly<Record<string, string>>): T {
  let result: unknown = base;
  for (const [key, text] of Object.entries(texts)) {
    result = replaceAt(result, key.split('.'), text);
  }
  return isSameShape(base, result) ? result : base;
}

/** Le résultat garde la forme de la base : seules des chaînes ont changé. */
function isSameShape<T extends object>(base: T, value: unknown): value is T {
  return (
    typeof value === 'object' && value !== null && Array.isArray(value) === Array.isArray(base)
  );
}

function replaceAt(node: unknown, path: readonly string[], text: string): unknown {
  const [head, ...rest] = path;
  if (head === undefined) {
    return typeof node === 'string' ? text : node;
  }
  if (typeof node !== 'object' || node === null || !Object.hasOwn(node, head)) {
    return node;
  }
  const child: unknown = Reflect.get(node, head);
  const next = replaceAt(child, rest, text);
  if (next === child) {
    return node;
  }
  if (Array.isArray(node)) {
    const copy: unknown[] = [...node];
    copy[Number(head)] = next;
    return copy;
  }
  return { ...node, [head]: next };
}
