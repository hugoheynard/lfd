#!/usr/bin/env node
/**
 * **La base du périmètre d'un push : le dernier commit de `dev` dont la CI
 * est VERTE**, et non le commit poussé juste avant.
 *
 * 🔴 L'incident du 2026-11-10. La CI compare au `github.event.before` du push
 * et annule le run précédent (`concurrency: cancel-in-progress`). Trois pushes
 * rapprochés sur `dev` (a9d5a3985 → 579028d4c → 3cbd8cfa7 → 125c1be9) ont
 * annulé les runs intermédiaires ; le run du dernier ne comparait qu'à
 * 3cbd8cfa7 et sautait l'API, les contrats et la boutique — alors que les
 * commits du milieu (API, `packages/contracts`, boutique) n'avaient jamais eu
 * de run complet vert. Un déploiement, qui attend un run vert PAR SHA, aurait
 * été satisfait par un run qui n'avait rien vérifié de ces changements.
 *
 * La règle : un run vert garantit que tout ce qui a changé depuis SA base est
 * vérifié ; si sa base est elle-même un commit vert, la garantie remonte de
 * proche en proche jusqu'au dernier run complet. Comparer au dernier vert
 * ancêtre de HEAD ferme donc le trou quel que soit le nombre de runs annulés,
 * rouges ou en échec entre les deux.
 *
 * ⚠️ Dans le doute, on rend une base VIDE, et `affected.mjs` lance alors TOUT
 * (la même règle de sûreté) : l'API GitHub muette, aucun run vert dans la
 * fenêtre lue, aucun d'eux ancêtre de HEAD (force-push, branche neuve).
 *
 * Usage : `node dev-toolbox/ci/last-green-base.mjs <owner/repo> <branche>` —
 * écrit le SHA (ou rien) sur la sortie standard. `GH_TOKEN` doit être posé.
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Combien de runs verts on lit au plus — une journée chargée en compte moins. */
export const GREEN_RUNS_READ = 50;

/**
 * Le premier SHA de la liste (du plus récent au plus ancien) qui est un
 * ancêtre STRICT de HEAD. Pure, pour être éprouvée sans git ni réseau.
 *
 * @param {readonly string[]} greenShas les têtes des runs verts, récents d'abord
 * @param {string} head le commit du push
 * @param {(sha: string) => boolean} isAncestor `sha` est-il un ancêtre de HEAD ?
 * @returns {string} le SHA retenu, ou "" (⇒ tout lancer)
 */
export function chooseBase(greenShas, head, isAncestor) {
  for (const sha of greenShas) {
    if (sha === head) {
      continue;
    }
    if (isAncestor(sha)) {
      return sha;
    }
  }
  return "";
}

/** Les têtes des runs verts du workflow `ci.yml` sur la branche, récents d'abord. */
function greenShas(repo, branch) {
  const output = execFileSync(
    "gh",
    [
      "api",
      `repos/${repo}/actions/workflows/ci.yml/runs?branch=${branch}&status=success&event=push&per_page=${GREEN_RUNS_READ}`,
      "--jq",
      ".workflow_runs[].head_sha",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  return output.split("\n").filter(Boolean);
}

function isAncestorOfHead(sha) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", sha, "HEAD"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function headSha() {
  return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [repo, branch] = process.argv.slice(2);
  let base = "";
  try {
    base = chooseBase(greenShas(repo, branch), headSha(), isAncestorOfHead);
  } catch {
    base = "";
  }
  console.error(
    base === ""
      ? "Base : aucun run vert ancêtre de HEAD — tout se lance."
      : `Base : dernier run vert ancêtre de HEAD, ${base}.`,
  );
  process.stdout.write(base);
}
