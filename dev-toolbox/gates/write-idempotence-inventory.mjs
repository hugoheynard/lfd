/**
 * L'inventaire des routes d'écriture rangées, écrit par
 * `node dev-toolbox/gates/write-idempotence.mjs --inventory [fichier]`
 * (plan `documentation/ops/plan-idempotence-des-ecritures.md`, § 8, J3).
 *
 * Il sert l'e2e de rejeu (`apps/lfd-api/test/write-replay.e2e-spec.ts`), qui
 * rejoue chaque route « par intention » : la porte dit qu'une route est
 * rangée, l'e2e prouve qu'elle résiste au rejeu. Les routes non rangées n'y
 * sont pas — elles échouent déjà à la porte.
 */

/** Une commande exécutée par la route, sauf la requête de relecture. */
const isCommand = (command) => !/Query$/.test(command.name);

/**
 * `{ route, httpMethod, path, case, handlers }` par route rangée, triées par
 * route. `route` est `fichier#méthode`, la clé que l'e2e inscrit dans sa
 * dette ; `handlers` les classes atteintes (`fichier#Classe`), vide hors de
 * la case « par intention ».
 *
 * @param routes les routes classées (`case`) de la porte.
 * @param resolveHandler commande → handler de la porte, ou `null`.
 */
export function inventoryOf(routes, resolveHandler) {
  return routes
    .filter((route) => ["intent", "nature", "accepted"].includes(route.case))
    .map((route) => ({
      route: `${route.file}#${route.method}`,
      httpMethod: route.httpMethod,
      path: route.path,
      case: route.case,
      handlers:
        route.case === "intent"
          ? route.commands
              .filter(isCommand)
              .map(resolveHandler)
              .filter((handler) => handler !== null)
              .map((handler) => `${handler.file}#${handler.name}`)
          : [],
    }))
    .sort((a, b) => a.route.localeCompare(b.route));
}
