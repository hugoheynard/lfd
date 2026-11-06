/**
 * Le catalogue des portes et des outils (`lint/lint-backend.json`,
 * `lint/tools.json`) et les règles pures que le lanceur leur applique.
 * Aucune entrée/sortie ici, hors la lecture des deux fichiers : tout le reste
 * se teste sans disque (`dev-toolbox/__tests__/lint-runner.test.mjs`).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const GATES_FILE = "lint/lint-backend.json";
export const TOOLS_FILE = "lint/tools.json";

/** Les portes, dans l'ordre de `pnpm lint:gates`. */
export function loadGates(root) {
  return JSON.parse(readFileSync(join(root, GATES_FILE), "utf8")).gates;
}

/** Les outils occasionnels. */
export function loadTools(root) {
  return JSON.parse(readFileSync(join(root, TOOLS_FILE), "utf8")).tools;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Ce qui manque à une entrée du catalogue des portes : une liste de phrases, vide si elle est complète. */
export function malformedGates(gates) {
  const problems = [];
  const seen = new Set();
  for (const gate of gates) {
    const where = `${GATES_FILE} › ${gate.name ?? "(sans nom)"}`;
    if (typeof gate.name !== "string" || gate.name.startsWith("lint:")) {
      problems.push(`${where} : \`name\` est le nom nu de la porte, sans « lint: ».`);
    }
    if (seen.has(gate.name)) problems.push(`${where} : nom en double.`);
    seen.add(gate.name);
    if ((gate.script === undefined) === (gate.command === undefined)) {
      problems.push(
        `${where} : il faut \`script\` (un fichier node) OU \`command\`, l'un des deux.`,
      );
    }
    if (typeof gate.holds !== "string" || gate.holds.length < 10) {
      problems.push(`${where} : \`holds\` dit en une phrase ce que la porte tient.`);
    }
    if (!DATE.test(gate.since ?? ""))
      problems.push(`${where} : \`since\` est une date AAAA-MM-JJ.`);
    if (!Array.isArray(gate.watch) || gate.watch.length === 0) {
      problems.push(`${where} : \`watch\` liste au moins un motif de chemin.`);
    }
  }
  return problems;
}

/** La commande qui lance une porte : `[programme, ...arguments]`. */
export function commandOf(gate) {
  return gate.command ?? ["node", gate.script, ...(gate.args ?? [])];
}

const COUNT = /les (\d+) portes du dépôt/u;

/**
 * Le compte que `CLAUDE.md` annonce au § 10 face à la liste. Rend `null`
 * s'ils concordent, sinon le message qui dit quoi corriger.
 */
export function countMismatch(claudeText, gateCount) {
  const match = COUNT.exec(claudeText);
  if (match === null) {
    return (
      "CLAUDE.md ne dit plus « les N portes du dépôt » (§ 10, à côté de `pnpm lint:gates`) : " +
      `remets la phrase avec ${gateCount}, le compte de ${GATES_FILE}.`
    );
  }
  const written = Number(match[1]);
  if (written === gateCount) return null;
  return (
    `CLAUDE.md (§ 10) annonce ${written} portes, ${GATES_FILE} en liste ${gateCount}. ` +
    `Une porte ajoutée ou retirée se dit aussi là : corrige le compte en ${gateCount}, ` +
    "et dis-la dans le bandeau d'en-tête."
  );
}

/** Un motif `watch` en expression régulière : `**` traverse les dossiers, `*` non. */
export function globToRegExp(glob) {
  let out = "";
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i];
    if (char === "*" && glob[i + 1] === "*") {
      const slash = glob[i + 2] === "/";
      out += slash ? "(?:.*/)?" : ".*";
      i += slash ? 2 : 1;
    } else if (char === "*") {
      out += "[^/]*";
    } else {
      out += char.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${out}$`, "u");
}

/**
 * Les portes qu'un lot de chemins touchés (relatifs à la racine) concerne :
 * un motif `watch` qui en lit un, le fichier de la porte lui-même, ou une
 * brique partagée de `dev-toolbox/gates/lib/`, qui les concerne toutes.
 */
export function gatesTouchedBy(paths, gates) {
  const shared = paths.some((path) => path.startsWith("dev-toolbox/gates/lib/"));
  return gates.filter((gate) => {
    if (shared) return true;
    const patterns = gate.watch.map(globToRegExp);
    return paths.some(
      (path) => path === gate.script || patterns.some((pattern) => pattern.test(path)),
    );
  });
}

/** Le résumé de fin : ce qui est passé, ce qui a échoué, par nom. */
export function summary(results) {
  const failed = results.filter((result) => !result.ok);
  const lines = [
    "",
    `── Portes : ${results.length - failed.length}/${results.length} vertes` +
      (failed.length === 0 ? "." : `, ${failed.length} rouge(s) :`),
  ];
  for (const result of failed) {
    lines.push(`   ✗ ${result.name}  — relancer : pnpm gate ${result.name}`);
  }
  return lines.join("\n");
}
