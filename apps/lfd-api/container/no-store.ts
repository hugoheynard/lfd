/**
 * La valeur que porte toute réponse des objets internes (`objets.interne`).
 *
 * Le Worker a le Workers Cache allumé (`"cache": { "enabled": true }`), et
 * chaque point d'entrée a le sien — `ContainerProxy`, par lequel passent les
 * appels du conteneur, compris. Sans en-tête, Cloudflare garde une réponse
 * selon ses règles par défaut, dont un 404 pendant quelques minutes : un
 * « absent » de l'objet était resservi à l'API sans que l'objet le voie
 * (`le-cache-du-back-office.md`, § 7). Une réponse d'objet n'est jamais
 * gardée hors de l'objet.
 */
export const INTERNAL_NO_STORE = "no-store, private";

/**
 * Refait la réponse avec `Cache-Control: no-store, private` — mêmes statut,
 * corps (en flux) et autres en-têtes ; un `Cache-Control` présent est remplacé.
 */
export function withNoStore(response: Response): Response {
  const kept = new Response(response.body, response);
  kept.headers.set("Cache-Control", INTERNAL_NO_STORE);
  return kept;
}
