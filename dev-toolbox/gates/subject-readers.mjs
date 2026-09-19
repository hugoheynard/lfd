#!/usr/bin/env node
/**
 * Gate : **le `sub` d'une personne ne se lit que là où il sert à l'identité.**
 *
 * Le `sub` est l'identifiant d'une personne **chez un tiers** — le fournisseur
 * de connexion. Il a servi d'auteur pendant des mois : une cinquantaine de
 * colonnes, deux journaux, des écrans qui l'affichaient brut, un export CSV qui
 * l'écrivait (`documentation/journalisation/architecture-journalisation.md` §12, §0).
 *
 * **Côté staff**, le plan l'a rendu inexprimable (D2, 2026-09-18) : après
 * `StaffAccessGuard`, la requête ne porte plus que l'accès, et le `sub` vérifié
 * ne transite que par un canal interne à `platform/auth/`. Cette porte tient la
 * seule chose que le type ne tient pas : que ce canal ne soit **importé que de
 * `platform/auth/`**.
 *
 * **Côté client**, `Principal.subject` reste nécessaire — changer l'adresse chez
 * le fournisseur, rapprocher un `sub` prouvé du `User` local (§8 du plan). On ne
 * peut pas le retirer du type ; on tient donc la **liste admise** de ses
 * lecteurs hors de `platform/auth/` et `platform/identity/`, chacun avec sa
 * raison. Un lecteur de plus échoue ; un lecteur admis qui ne lit plus échoue
 * aussi, pour que la liste se vide au lieu de mentir.
 *
 * ## Ce qu'elle voit, et ce qu'elle ne voit pas
 *
 * Un fichier **lit le `sub` client** s'il importe le module du principal client
 * (`platform/auth/principal.js` : `Principal`, `VerifiedToken`,
 * `AuthenticatedRequest`) et accède à `subject` — `.subject`, `?.subject`,
 * `["subject"]` ou une déstructuration `{ subject }`. C'est une lecture du
 * graphe d'imports, pas du typage : un principal reçu sans que son type soit
 * importé (inféré d'un appel) lui échappe. Le cas ne se présente pas au
 * 2026-09-18 — chaque lecteur trouvé par le compilateur importe le type.
 *
 * Les tests ne sont pas lus : un doublé qui fabrique un principal écrit son
 * `subject`, et c'est son travail.
 *
 * Usage : `pnpm lint:subject-readers` (branché dans `lint:gates`).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN_ROOT = "apps/lfd-api/src";
const SKIP_DIRS = new Set(["node_modules", "dist", "client", "coverage", ".turbo", "__tests__"]);

/** Les dossiers dont c'est le métier : l'authentification et l'identité. */
const IDENTITY_HOMES = ["apps/lfd-api/src/platform/auth/", "apps/lfd-api/src/platform/identity/"];

/**
 * Les lecteurs admis du `sub` client hors de ces dossiers, **et pourquoi**.
 * Vérifiés le 2026-09-18 en cherchant chaque lecture de `subject` sur un
 * fichier qui importe le principal client.
 */
const ADMITTED = new Map([
  [
    "apps/lfd-api/src/b2b/account/http/me.controller.ts",
    "changer l'adresse de connexion chez le fournisseur, qui ne connaît que le `sub`",
  ],
  [
    "apps/lfd-api/src/b2b/account/infrastructure/customer-principal.resolver.ts",
    "l'adaptateur du port PrincipalResolver : rapproche le `sub` prouvé du `User` " +
      "local (provisionnement, invité sans compte qui se connecte, accès en attente)",
  ],
]);

/** Le module du principal CLIENT — pas `staff-principal.js`. */
const CLIENT_PRINCIPAL_IMPORT = /from\s+"(?:\.\.?\/)+(?:platform\/)?auth\/principal\.js"/u;

/** Le canal interne des gardes staff : importé depuis `platform/auth/` seulement. */
const STAFF_CHANNEL_IMPORT = /from\s+"[^"]*verified-staff-identity\.js"/u;

const SUBJECT_READ = [
  /\??\.subject\b/u,
  /\[\s*"subject"\s*\]/u,
  /\{[^{}]*\bsubject\b[^{}]*\}\s*=/u,
  /\(\s*\{[^{}]*\bsubject\b[^{}]*\}\s*:/u,
];

/** Commentaires et gabarits retirés : une porte qui lit la PROSE ne garde rien. */
function withoutNoise(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/^\s*\/\/.*$/gmu, "")
    .replace(/`[^`]*`/gu, "``");
}

/** Vrai si ce source importe le principal client ET lit son `subject`. */
function readsClientSubject(source) {
  const code = withoutNoise(source);
  return CLIENT_PRINCIPAL_IMPORT.test(code) && SUBJECT_READ.some((read) => read.test(code));
}

/**
 * Le détecteur, éprouvé à chaque exécution sur un cas refusé et un cas admis.
 * Une porte dont le motif s'est cassé ne refuse plus rien, et le dit en vert.
 */
function selfCheck() {
  const cases = [
    [
      'import type { Principal } from "../../../platform/auth/principal.js";\nx(user.subject);',
      true,
    ],
    [
      'import type { Principal } from "../../platform/auth/principal.js";\nconst { subject } = p;',
      true,
    ],
    ['import type { Principal } from "../../platform/auth/principal.js";\nx(user.userId);', false],
    [
      'import type { StaffAccess } from "../../platform/auth/staff-principal.js";\nx(a.subject);',
      false,
    ],
    ['import type { Principal } from "../../platform/auth/principal.js";\n// user.subject', false],
  ];
  const broken = cases.filter(([source, expected]) => readsClientSubject(source) !== expected);
  if (broken.length > 0) {
    console.error(`✗ subject-readers : le détecteur se trompe sur ${broken.length} cas témoin(s).`);
    process.exit(1);
  }
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return SKIP_DIRS.has(entry.name) ? [] : sourceFiles(path);
    }
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".spec.ts") ? [path] : [];
  });
}

const unix = (path) => path.split("\\").join("/");
const inIdentityHome = (rel) => IDENTITY_HOMES.some((home) => rel.startsWith(home));

selfCheck();

const root = join(ROOT, SCAN_ROOT);
if (!statSync(root, { throwIfNoEntry: false })?.isDirectory()) {
  console.error(`✗ subject-readers : ${SCAN_ROOT} introuvable.`);
  process.exit(1);
}

const newReaders = [];
const channelLeaks = [];
const readers = new Set();
for (const file of sourceFiles(root)) {
  const rel = unix(relative(ROOT, file));
  const source = readFileSync(file, "utf8");
  if (!rel.startsWith("apps/lfd-api/src/platform/auth/") && STAFF_CHANNEL_IMPORT.test(source)) {
    channelLeaks.push(rel);
  }
  if (inIdentityHome(rel) || !readsClientSubject(source)) {
    continue;
  }
  readers.add(rel);
  if (!ADMITTED.has(rel)) {
    newReaders.push(rel);
  }
}
const stale = [...ADMITTED.keys()].filter((rel) => !readers.has(rel));

if (channelLeaks.length + newReaders.length + stale.length > 0) {
  for (const rel of channelLeaks) {
    console.error(
      `✗ ${rel}\n    importe le canal interne des gardes staff (verified-staff-identity).`,
    );
  }
  for (const rel of newReaders) {
    console.error(`✗ ${rel}\n    lit le \`sub\` d'un principal client hors de la liste admise.`);
  }
  for (const rel of stale) {
    console.error(`✗ ${rel}\n    est admis mais ne lit plus le \`sub\` : retirez-le de ADMITTED.`);
  }
  console.error(
    "\n  Un auteur est un identifiant de chez nous — `userId` côté client, " +
      "`@StaffUserId()` côté staff.\n" +
      "  Si la lecture sert vraiment l'IDENTITÉ (le fournisseur de connexion ne " +
      "connaît que le `sub`),\n  ajoutez le fichier à ADMITTED avec sa raison écrite.\n",
  );
  process.exit(1);
}

console.log(
  `✓ subject-readers : ${readers.size} lecteur(s) admis du \`sub\` client hors ` +
    "de l'authentification ; le canal des gardes staff ne sort pas de platform/auth.",
);
