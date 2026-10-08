/**
 * **Reconnaître qu'une nouvelle version est en ligne, avant qu'un écran casse.**
 *
 * `stale-bundle.ts` répare après coup : un onglet resté sur une version retirée
 * se recharge quand il demande un morceau qui n'existe plus. Un onglet qui ne
 * charge AUCUN écran neuf — « Tournées » ouvert des heures — ne le voit jamais,
 * et parle à l'API avec l'ancien contrat (`documentation/ci-cd/
 * plan-nouvelle-version-des-fronts.md`).
 *
 * Le déploiement écrit le même SHA à deux endroits : une balise de `index.html`
 * (ce que l'onglet a chargé) et `/version.json` (ce qui est servi). Les comparer
 * suffit. Ce fichier ne porte que des décisions pures, testées sans navigateur.
 */

/** Le `name` de la balise `<meta>` que le déploiement insère dans `index.html`. */
export const BUILD_META_NAME = "lfd-build";

/** Le fichier de version, servi à la racine du site par le déploiement. */
export const VERSION_FILE_PATH = "/version.json";

/** Relecture onglet visible — le même filet que `day-version-watcher.ts`. */
export const NEW_VERSION_POLL_MS = 5 * 60_000;

/** La valeur de `data.newVersion` d'une route qui affiche un bandeau au lieu de recharger. */
export const NEW_VERSION_BANNER = "banner";

/** Ce que la lecture de la balise demande au document — injecté pour les tests. */
export interface MetaReader {
  querySelector(selector: string): { getAttribute(name: string): string | null } | null;
}

/**
 * Le build que cet onglet a chargé, ou `null` sans balise (dev local, `ng
 * serve`) — et alors la veille ne démarre pas : rien à comparer.
 */
export function readBuildMeta(doc: MetaReader): string | null {
  const content = doc.querySelector(`meta[name="${BUILD_META_NAME}"]`)?.getAttribute("content");
  const build = content?.trim() ?? "";
  return build === "" ? null : build;
}

/** Le build annoncé par le fichier de version, ou `null` s'il ne ressemble à rien. */
export function parseVersionFile(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("build" in body)) {
    return null;
  }
  const build = body.build;
  return typeof build === "string" && build.trim() !== "" ? build.trim() : null;
}

/** Une lecture ratée (`null`) ne dit rien : seul un build lu et différent compte. */
export function isNewBuild(current: string, served: string | null): boolean {
  return served !== null && served !== current;
}

/** L'adresse relue, avec un paramètre qui traverse tout cache intermédiaire. */
export function versionFileUrl(nowMs: number): string {
  return `${VERSION_FILE_PATH}?t=${nowMs}`;
}

/** Le `fetch` minimal dont la lecture a besoin. */
export type VersionFetch = (
  url: string,
  init: { readonly cache: "no-store" },
) => Promise<{ readonly ok: boolean; json(): Promise<unknown> }>;

/**
 * Relit le build servi. Toute panne — réseau coupé, 404 pendant un
 * déploiement, corps illisible — rend `null` : un silence, jamais une alerte.
 */
export async function fetchServedBuild(
  fetchFn: VersionFetch,
  nowMs: number,
): Promise<string | null> {
  try {
    const response = await fetchFn(versionFileUrl(nowMs), { cache: "no-store" });
    return response.ok ? parseVersionFile(await response.json()) : null;
  } catch {
    return null;
  }
}

/**
 * Recharger à cette navigation ? Seulement si une version neuve est connue et
 * que la route cible n'a pas demandé le bandeau. La garde anti-boucle
 * (`shouldReload`) se décide APRÈS, parce qu'elle écrit.
 */
export function shouldReloadOnNavigation(newVersion: boolean, targetMode: unknown): boolean {
  return newVersion && targetMode !== NEW_VERSION_BANNER;
}

/** La `data` d'un nœud de route, et son enfant principal. */
export interface RouteDataNode {
  readonly data: Readonly<Record<string, unknown>>;
  readonly firstChild: RouteDataNode | null;
}

/**
 * Le mode demandé par la route la plus profonde. Angular hérite la `data` des
 * parents sans composant ; on lit donc la feuille, en remontant au premier
 * ancêtre qui la pose.
 */
export function newVersionModeOf(root: RouteDataNode): unknown {
  let mode: unknown = root.data["newVersion"];
  let node = root.firstChild;
  while (node !== null) {
    if (node.data["newVersion"] !== undefined) {
      mode = node.data["newVersion"];
    }
    node = node.firstChild;
  }
  return mode;
}
