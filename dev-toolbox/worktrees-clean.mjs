// pnpm tool worktrees:clean [--apply]
//
// **Le ménage des copies de travail des agents** (`.claude/worktrees/`).
//
// Un agent lancé dans sa propre copie la voit retirée s'il n'a rien changé ;
// dès qu'il commite, elle reste. Le 2026-11-08, 43 copies pesaient 23 Go, et
// deux d'entre elles portaient des corrections jamais fusionnées : c'est
// pourquoi ce ménage ne retire QUE ce qui ne peut rien perdre.
//
// Une copie est retirée si, et seulement si :
//   1. elle vit sous `.claude/worktrees/` ;
//   2. elle n'est pas verrouillée (`git worktree lock` : une session l'utilise) ;
//   3. `git status --porcelain` est vide — ni modification, ni fichier neuf ;
//   4. chacun de ses commits est déjà dans la branche de référence PAR SON
//      CONTENU (`git cherry` : aucun `+`) ;
//   5. personne n'y a touché depuis 24 h (un agent en cours garde la sienne).
//
// Le retrait est `git worktree remove` SANS `--force` : git refuse de lui-même
// une copie qui aurait changé entre la vérification et le geste. La BRANCHE
// reste : ses commits restent récupérables. À blanc par défaut — `--apply`
// retire. Ne sort jamais en erreur : un hook git ne doit pas bloquer.

import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import { join, sep } from "node:path";

/** Une copie qu'un geste humain vient peut-être de quitter : on la laisse un jour. */
export const IDLE_MS = 24 * 60 * 60 * 1000;

/**
 * La décision, pure : pourquoi garder cette copie, ou `null` pour la retirer.
 * Chaque raison est une phrase lue par un humain dans le compte rendu.
 */
export function keepReason(copy, nowMs) {
  if (!copy.underAgentDir) return "hors de .claude/worktrees";
  if (copy.locked) return "verrouillée (une session l'utilise)";
  if (copy.dirtyLines > 0) return `${copy.dirtyLines} fichier(s) non commité(s)`;
  if (copy.uniqueCommits > 0) return `${copy.uniqueCommits} commit(s) absent(s) de ${copy.base}`;
  if (nowMs - copy.lastTouchMs < IDLE_MS) return "touchée depuis moins de 24 h";
  return null;
}

/** Lit `git worktree list --porcelain` en fiches { path, locked }. */
export function parseWorktrees(porcelain) {
  const copies = [];
  for (const block of porcelain.split("\n\n")) {
    const lines = block.split("\n");
    const path = lines.find((line) => line.startsWith("worktree "))?.slice("worktree ".length);
    if (path !== undefined) {
      copies.push({ path, locked: lines.some((line) => line.startsWith("locked")) });
    }
  }
  return copies;
}

function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
}

function lastTouchMs(path) {
  // Le dossier git de la copie : son index bouge à chaque geste qu'on y fait.
  const gitDir = git(path, ["rev-parse", "--absolute-git-dir"]).trim();
  return Math.max(
    ...["index", "HEAD"].map((file) => {
      try {
        return statSync(join(gitDir, file)).mtimeMs;
      } catch {
        return 0;
      }
    }),
  );
}

function baseBranch(root) {
  for (const candidate of ["dev", "main"]) {
    try {
      git(root, ["rev-parse", "--verify", "--quiet", candidate]);
      return candidate;
    } catch {
      // branche absente : on essaie la suivante
    }
  }
  return null;
}

function inspect(root, base, copy) {
  const agentDir = join(root, ".claude", "worktrees") + sep;
  const dirty = git(copy.path, ["status", "--porcelain"]).split("\n").filter(Boolean).length;
  const head = git(copy.path, ["rev-parse", "HEAD"]).trim();
  const unique = git(root, ["cherry", base, head])
    .split("\n")
    .filter((line) => line.startsWith("+")).length;
  return {
    ...copy,
    base,
    underAgentDir: copy.path.startsWith(agentDir),
    dirtyLines: dirty,
    uniqueCommits: unique,
    lastTouchMs: lastTouchMs(copy.path),
  };
}

function main() {
  const apply = process.argv.includes("--apply");
  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  const base = baseBranch(root);
  if (base === null) {
    console.log("worktrees:clean — ni dev ni main : rien à comparer, rien n'est retiré.");
    return;
  }
  const copies = parseWorktrees(git(root, ["worktree", "list", "--porcelain"])).filter(
    (copy) => copy.path !== root,
  );
  let removed = 0;
  const kept = [];
  for (const copy of copies) {
    let reason;
    let facts;
    try {
      facts = inspect(root, base, copy);
      reason = keepReason(facts, Date.now());
    } catch {
      reason = "illisible (vérifiée à la main)";
    }
    if (reason !== null) {
      if (facts?.underAgentDir !== false)
        kept.push(`  garde  ${copy.path.split(sep).pop()} — ${reason}`);
      continue;
    }
    if (!apply) {
      removed += 1;
      kept.push(`  retirerait  ${copy.path.split(sep).pop()}`);
      continue;
    }
    try {
      git(root, ["worktree", "remove", copy.path]);
      removed += 1;
    } catch {
      kept.push(`  garde  ${copy.path.split(sep).pop()} — git a refusé le retrait`);
    }
  }
  const verb = apply ? "retirée(s)" : "à retirer (à blanc ; --apply pour le faire)";
  console.log(`worktrees:clean — ${removed} copie(s) ${verb}, branches gardées.`);
  for (const line of kept) console.log(line);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    console.log(
      `worktrees:clean — arrêté sans rien retirer : ${error instanceof Error ? error.message : error}`,
    );
  }
}
