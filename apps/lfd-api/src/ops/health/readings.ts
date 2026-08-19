import type { NodeReading, TrafficWindow } from "@lfd/ops-contract";

/**
 * **Ce que chaque nœud sait dire de son activité.**
 *
 * Un seul endroit, une seule règle : un relevé n'existe que si quelque chose le
 * mesure vraiment. Rien n'est estimé, rien n'est extrapolé — un chiffre inventé
 * sur un écran de diagnostic coûte plus cher que pas de chiffre du tout, parce
 * qu'on le croit.
 *
 * Pur et testé, comme la dérivation du statut : ce sont les deux endroits où
 * l'on décide ce que l'écran raconte.
 */

/**
 * Les modules de `lfd-api`, et les surfaces qui leur appartiennent.
 *
 * Déclaré, jamais deviné — c'est le même arbitrage que la topologie. Une
 * correspondance inférée d'un préfixe changerait toute seule le jour où une
 * route bouge, et la charge d'un module se mettrait à fondre sans que rien ne
 * soit tombé.
 *
 * L'ordre compte : la première entrée qui matche gagne, donc les préfixes les
 * plus spécifiques d'abord.
 */
const MODULES: readonly { readonly module: string; readonly prefixes: readonly string[] }[] = [
  { module: "OPS", prefixes: ["admin/ops"] },
  { module: "Staff", prefixes: ["admin/staff-users", "admin/me"] },
  { module: "PIM", prefixes: ["catalogue", "channels", "commerce", "locations", "allergens"] },
  { module: "B2B", prefixes: ["orders", "admin", "me", "catalog", "companies", "subscriptions"] },
];

/** À quel module appartient une surface. `Autre` plutôt qu'un rangement forcé. */
export function moduleOf(surface: string): string {
  for (const entry of MODULES) {
    if (entry.prefixes.some((prefix) => surface === prefix || surface.startsWith(`${prefix}/`))) {
      return entry.module;
    }
  }
  return "Autre";
}

/**
 * Le **débit** d'un nœud, en requêtes par seconde.
 *
 * C'est le relevé de la gateway : elle voit tout passer, et « combien par
 * seconde » est la seule question qu'on lui pose vraiment. Le total brut, lui,
 * dépend de la fenêtre choisie — deux écrans réglés différemment ne se
 * compareraient pas.
 */
export function throughputOf(window: TrafficWindow): number {
  const seconds = (Date.parse(window.to) - Date.parse(window.from)) / 1000;
  return seconds > 0 ? Math.round((window.requests / seconds) * 10) / 10 : 0;
}

/** Les relevés d'un nœud observé par la gateway : le débit, et rien d'autre. */
export function gatewayReadings(windows: readonly TrafficWindow[]): readonly NodeReading[] {
  const requests = windows.reduce((sum, window) => sum + window.requests, 0);
  const [first] = windows;
  if (first === undefined || requests === 0) {
    return [];
  }
  const seconds = (Date.parse(first.to) - Date.parse(first.from)) / 1000;
  return [
    {
      label: "Débit",
      value: seconds > 0 ? Math.round((requests / seconds) * 10) / 10 : 0,
      unit: "req/s",
      hint: "Tout ce qui traverse la gateway, tous backends confondus.",
    },
  ];
}

/**
 * Les relevés d'un service applicatif : sa charge **par module**.
 *
 * C'est ce qui transforme « l'API peine » en « l'API peine SUR le référentiel ».
 * Les modules sans trafic ne sont pas listés : une ligne à zéro occupe autant de
 * place qu'une ligne qui parle.
 */
export function moduleReadings(window: TrafficWindow | undefined): readonly NodeReading[] {
  const surfaces = window?.surfaces ?? [];
  if (surfaces.length === 0) {
    return [];
  }
  const byModule = new Map<string, number>();
  for (const surface of surfaces) {
    const module = moduleOf(surface.surface);
    byModule.set(module, (byModule.get(module) ?? 0) + surface.requests);
  }
  return [...byModule.entries()]
    .filter(([, requests]) => requests > 0)
    .sort(([, left], [, right]) => right - left)
    .map(([module, requests]) => ({
      label: module,
      value: requests,
      hint: `Requêtes servies par le module ${module} sur la fenêtre.`,
    }));
}
