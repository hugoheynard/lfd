import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * L'invariant qui protège le mur de l'oubli : **aucune surface `/admin/*` ne
 * peut exister sans déclarer son périmètre**.
 *
 * Le guard est déjà fail-closed — un contrôleur sans ressource rend `403`. Mais
 * un 403 se découvre au premier clic d'un collègue, six semaines plus tard, et
 * ressemble à une panne. Ce test le découvre à l'écriture.
 *
 * Il lit les **sources** plutôt que les routes montées, parce que c'est là qu'on
 * se trompe : on copie un contrôleur voisin, on change le chemin, et on oublie
 * la ligne qui compte.
 */

/** Les seules surfaces `/admin/*` qui ne relèvent PAS du modèle de permissions. */
const CRON_SURFACES: readonly string[] = [
  "admin-recompute.controller.ts",
  "admin-recompute-norms.controller.ts",
];

/** Ce qui vaut déclaration de périmètre. */
const DECLARATIONS = ["@AdminSurface(", "@AdminSelfSurface(", "RecomputeGuard"] as const;

function sourceFiles(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".spec.ts") ? [path] : [];
  });
}

interface AdminController {
  readonly file: string;
  readonly source: string;
}

/**
 * Retire commentaires de bloc et de ligne.
 *
 * Sans ça, ce test lit la **prose** : une phrase qui explique le montage suffit
 * à le satisfaire — ou à le faire échouer, ce qui est arrivé au premier jet. Un
 * garde-fou qui se laisse convaincre par un commentaire ne garde rien.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function adminControllers(): readonly AdminController[] {
  const root = join(process.cwd(), "src");
  return sourceFiles(root)
    .map((file) => ({ file, source: withoutComments(readFileSync(file, "utf8")) }))
    .filter(({ source }) => /@Controller\("admin/.test(source));
}

describe("les surfaces admin déclarent toutes leur périmètre", () => {
  const controllers = adminControllers();

  it("en trouve — sinon ce test se croirait vert en ne regardant rien", () => {
    // Un scan qui ne trouve aucun fichier passerait tous les cas suivants. On
    // fige donc un plancher : la surface admin ne va pas disparaître.
    expect(controllers.length).toBeGreaterThanOrEqual(20);
  });

  it.each(adminControllers().map(({ file, source }) => [file.split("/").slice(-1)[0], source]))(
    "%s",
    (name, source) => {
      if (CRON_SURFACES.includes(String(name))) {
        expect(source).toContain("RecomputeGuard");
        return;
      }
      const declared = DECLARATIONS.some((marker) => source.includes(marker));
      expect(declared).toBe(true);
    },
  );

  it("n'a plus une seule porte montée à la main", () => {
    // `@Public()` + `@UseGuards(AdminAuthGuard)` était l'ancien montage : il
    // authentifiait sans autoriser. Le laisser réapparaître rouvrirait le trou
    // que la tranche 3 a fermé.
    const handMounted = controllers.filter(({ source }) =>
      source.includes("@UseGuards(AdminAuthGuard)"),
    );

    expect(handMounted.map(({ file }) => file)).toEqual([]);
  });
});
