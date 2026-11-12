import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/** Une route de l'inventaire de la porte `write-idempotence` (`--inventory`). */
export interface InventoryRoute {
  /** `fichier#méthode` du contrôleur : la clé des scénarios et de la dette. */
  readonly route: string;
  readonly httpMethod: "POST" | "PUT" | "PATCH" | "DELETE";
  /** Le chemin complet, `:param` compris ; `{NOM}` pour une constante importée. */
  readonly path: string;
  readonly case: "intent" | "nature" | "accepted";
  readonly handlers: readonly string[];
}

/**
 * Les routes « par intention », lues dans l'inventaire que la porte écrit À
 * L'INSTANT : un inventaire commité dériverait du code, et une route ajoutée
 * hier échapperait au test sans que rien ne le dise.
 */
export function intentRoutes(): readonly InventoryRoute[] {
  const root = resolve(process.cwd(), "../..");
  const target = join(mkdtempSync(join(tmpdir(), "write-replay-")), "inventory.json");
  execFileSync(
    process.execPath,
    ["dev-toolbox/gates/write-idempotence.mjs", "--inventory", target],
    {
      cwd: root,
    },
  );
  const routes = JSON.parse(readFileSync(target, "utf8")) as readonly InventoryRoute[];
  return routes.filter((route) => route.case === "intent");
}

/**
 * Les préfixes montés par un `RouterModule` (`pim/pim.module.ts`), que la
 * porte ne lit pas : elle ne voit que `@Controller` et le verbe (vérifié le
 * 2026-11-12, seul `PimModule` en monte).
 */
const ROUTER_MOUNTS = ["", "/pim", "/pim/channels/b2b"] as const;

/** Le chemin concret désigne-t-il bien la route de l'inventaire ? */
export function matchesPath(pattern: string, concrete: string): boolean {
  const source = pattern
    .split("/")
    .map((segment) =>
      segment.startsWith(":") ? "[^/]+" : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    )
    .join("/");
  const path = concrete.split("?")[0] ?? "";
  return ROUTER_MOUNTS.some((mount) => new RegExp(`^${mount}${source}$`).test(path));
}
