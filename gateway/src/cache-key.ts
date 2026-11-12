/**
 * Les routes que le bord de Cloudflare garde (`public, max-age`), et les
 * seuls paramètres qu'elles lisent. Le cache du Worker de l'API a pour clé
 * l'URL complète : un `?x=<aléatoire>` y fabriquerait une entrée neuve, donc
 * une lecture de la base facturée à l'opération, à chaque appel. La passerelle
 * ne transmet donc à ces routes que leurs paramètres, dans un ordre fixe.
 *
 * Les deux contrôleurs lisent `lang` et `audience`, et rien d'autre
 * (`shop-catalogue.controller.ts`, `shop-featured.controller.ts`, vérifié le
 * 2026-11-12). Un paramètre ajouté à l'un d'eux doit l'être ici.
 */
const CACHED_ROUTE_PARAMS: Readonly<Record<string, readonly string[]>> = {
  "/shop/catalogue": ["audience", "lang"],
  "/shop/featured": ["audience", "lang"],
};

/**
 * La chaîne de requête à transmettre au backend pour `path` : intacte hors des
 * routes gardées ; réduite à leurs paramètres connus (une seule valeur chacun,
 * dans l'ordre alphabétique) sur ces routes.
 */
export function forwardedSearch(path: string, search: string): string {
  const kept = CACHED_ROUTE_PARAMS[path];
  if (kept === undefined) {
    return search;
  }
  const incoming = new URLSearchParams(search);
  const outgoing = new URLSearchParams();
  for (const name of kept) {
    const value = incoming.get(name);
    if (value !== null) {
      outgoing.set(name, value);
    }
  }
  const query = outgoing.toString();
  return query === "" ? "" : `?${query}`;
}
