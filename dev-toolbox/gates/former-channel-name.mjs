#!/usr/bin/env node
/**
 * Gate : **le nom de l'ancien canal de vente en ligne ne revient pas.**
 *
 * Le canal est parti le 2026-09-21 (driver, paquet de transport, tables) ; son
 * vocabulaire a survécu trois semaines dans le contexte de vente, les contrats,
 * l'écran des points de vente, le journal, le semis et une cinquantaine de
 * commentaires. Le 2026-10-16, Hugo : « je ne veux plus un seul bout de code
 * [de ce canal], front, back, admin — c'est important ». Tout est sorti le même
 * jour, faits passés compris, renommés par migration (plan du retrait intégral
 * de l'ancien canal, `documentation/pim/`, S6).
 *
 * Sans porte, le mot revient au premier copier-coller d'un vieux document.
 *
 * ## Ce qu'elle lit
 *
 * Ce que git suit, et ce qui est en passe de l'être (`git grep --untracked`,
 * qui respecte `.gitignore`) — jamais le disque : le client Prisma généré et les
 * `dist/` n'appartiennent pas au dépôt. Insensible à la casse, texte seulement.
 *
 * ## Ce qu'elle admet
 *
 * - `apps/lfd-api/prisma/migrations/**` : les `migration.sql` déjà appliquées
 *   ne se touchent pas (checksum Prisma), et la migration qui a renommé les
 *   faits doit nommer ce qu'elle remplace. C'est la SEULE admission durable.
 *
 * L'admission temporaire ci-dessous ne peut que disparaître.
 *
 * ⚠️ Le mot n'est écrit nulle part ici en entier — ni dans le nom de la porte,
 * ni dans celui de son script : elle se refuserait elle-même. Il est recomposé
 * à l'exécution.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** Le mot, recomposé pour que ce fichier ne le porte pas. */
const WORD = ["sho", "pify"].join("");

/** La seule admission durable. */
const ADMITTED = ["apps/lfd-api/prisma/migrations/**"];

/**
 * ⏳ TEMPORAIRE (2026-10-16) — la documentation se purge en parallèle du code
 * (plan, lot S-b). Ces deux entrées se RETIRENT dès que la purge de
 * `documentation/` et de `CLAUDE.md` est faite ; la porte les couvre alors
 * comme le reste.
 */
const TEMPORARILY_ADMITTED = ["documentation/**", "CLAUDE.md"];

const excludes = [...ADMITTED, ...TEMPORARILY_ADMITTED].map((glob) => `:(exclude,glob)${glob}`);
const result = spawnSync(
  "git",
  ["grep", "-l", "-i", "-I", "--untracked", "-e", WORD, "--", ".", ...excludes],
  { cwd: ROOT, encoding: "utf8" },
);

// `git grep` : 0 = trouvé, 1 = rien, au-delà = la commande elle-même a échoué.
if (result.status !== 0 && result.status !== 1) {
  console.error(`\n✗ former-channel-name : git grep a échoué (code ${String(result.status)}).`);
  console.error(result.stderr);
  process.exit(2);
}

const offenders = result.stdout.split("\n").filter((line) => line !== "");

if (offenders.length > 0) {
  console.error("\n✗ former-channel-name\n");
  for (const path of offenders) {
    console.error(`  ${path}`);
  }
  console.error(
    "\n  Le nom de l'ancien canal de vente en ligne est sorti du dépôt le 2026-10-16,\n" +
      "  faits passés compris. Dire « l'ancien canal de vente en ligne » quand il faut\n" +
      "  en parler ; un réglage qui lui appartenait n'a plus de raison d'exister.\n",
  );
  process.exit(1);
}

console.log(
  `✓ former-channel-name : aucun fichier suivi ne porte le nom de l'ancien canal\n` +
    `  (admis : ${ADMITTED.join(", ")} ; temporairement : ${TEMPORARILY_ADMITTED.join(", ")}).`,
);
