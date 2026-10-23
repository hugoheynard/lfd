#!/usr/bin/env node
/**
 * Gate : **le rôle d'une personne dans une société ne se lit que par LA
 * requête partagée** — `readCompanyStanding`
 * (`apps/lfd-api/src/b2b/shared/company-standing/`).
 *
 * Le mur du commerce n'avait pas deux voies mais une dizaine : un lecteur de
 * rôle par contexte, chacun avec sa copie de la condition (« membership qui
 * ouvre », « acceptée, principal actif »). Le jour où les sous-comptes ont
 * ouvert leurs sites au détenteur du principal (S6,
 * `documentation/comptes-client/plan-entrer-dans-ses-sites.md`, R1), chaque
 * copie oubliée devenait soit une porte fermée au légitime, soit une fuite
 * entre frères. Hugo, 2026-10-23 : « on doit verrouiller ça avec un lint ».
 *
 * ## Ce qu'elle voit
 *
 * Un fichier **lit le rôle d'une personne dans une société** s'il :
 * - importe les briques de la règle hors de leur dossier : `openingMembership`,
 *   `effective-role` (`effectiveRole`, `INHERITING_PARENT_ROLES`) ;
 * - ou interroge les rattachements en Prisma **par personne** : un
 *   `membership.find…`/`count` dont le `where` porte `userId`, ou un filtre
 *   imbriqué `memberships: { where | some | every | none: { userId … } }`.
 *
 * Les lectures « qui sont les membres de cette société » (destinataires,
 * fiches staff) ne filtrent pas par personne : elles ne sont pas vues, et ce
 * n'est pas leur sujet. Une lecture par personne qui sert à autre chose qu'un
 * accès est ADMISE, avec sa raison ; un admis qui ne lit plus échoue, pour
 * que la liste se vide au lieu de mentir.
 *
 * C'est une lecture du texte, pas du typage : un `where` construit ailleurs et
 * passé par variable lui échappe. Les tests ne sont pas lus.
 *
 * Usage : `pnpm lint:company-role-readers` (branché dans `lint:gates`).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN_ROOT = "apps/lfd-api/src";
const SKIP_DIRS = new Set(["node_modules", "dist", "client", "coverage", ".turbo", "__tests__"]);

/**
 * L'outillage de démonstration : il sème et purge des rattachements, il ne
 * décide d'aucun accès — et personne ne l'importe (`CLAUDE.md` §3).
 */
const TOOLING = "apps/lfd-api/src/dev/";

/** Le dossier de la requête partagée : le seul où la règle s'écrit. */
const HOME = "apps/lfd-api/src/b2b/shared/company-standing/";
const QUERY =
  "readCompanyStanding (b2b/shared/company-standing/infrastructure/read-company-standing.ts)";

/**
 * Les lecteurs par personne admis hors du dossier, **et pourquoi**. Vérifiés le
 * 2026-10-23 en lisant chaque fichier que le détecteur relève.
 */
const ADMITTED = new Map([
  [
    "apps/lfd-api/src/b2b/account/infrastructure/prisma-invitation-renewal.ts",
    "le renvoi d'une invitation par le staff : retrouve le rattachement NON accepté à " +
      "rafraîchir ; il n'ouvre ni ne ferme aucun accès client",
  ],
  [
    "apps/lfd-api/src/b2b/account/infrastructure/prisma-person-attachment.lock.ts",
    "sous verrou, « cette personne a-t-elle déjà une société ? » pour refuser un second " +
      "rattachement simultané — un comptage, pas un rôle",
  ],
  [
    "apps/lfd-api/src/b2b/account/infrastructure/prisma-account.reader.ts",
    "`GET /me` liste les sociétés PROPRES et leur rôle, tels quels ; les sites atteints " +
      "par héritage y viennent de la requête partagée (`readReachableSites`)",
  ],
]);

const BRICK_IMPORT =
  /from\s+"[^"]*(?:company-standing\/infrastructure\/opening-membership|company-standing\/domain\/effective-role|membership-opening\/opening-membership|services\/effective-role)\.js"/u;

const PERSON_READS = [
  /\.membership\.(?:findFirst|findFirstOrThrow|findUnique|findUniqueOrThrow|findMany|count)\(\s*\{\s*where\s*:\s*\{[^{}]*\buserId\b/u,
  /\bmemberships\s*:\s*\{\s*(?:where|some|every|none)\s*:\s*\{[^{}]*\buserId\b/u,
];

/** Commentaires et gabarits retirés : une porte qui lit la PROSE ne garde rien. */
function withoutNoise(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/^\s*\/\/.*$/gmu, "")
    .replace(/`[^`]*`/gu, "``");
}

/** Vrai si ce source lit le rôle d'une personne dans une société par lui-même. */
export function readsCompanyRole(source) {
  const code = withoutNoise(source);
  return BRICK_IMPORT.test(code) || PERSON_READS.some((read) => read.test(code));
}

/**
 * Le détecteur, éprouvé à chaque exécution sur des cas refusés et admis.
 * Une porte dont le motif s'est cassé ne refuse plus rien, et le dit en vert.
 */
function selfCheck() {
  const cases = [
    [
      "const m = await this.prisma.membership.findFirst({\n  where: { userId, companyId },\n  select: { role: true },\n});",
      true,
    ],
    [
      "const c = await prisma.company.findUnique({ select: { memberships: { where: { userId, acceptedAt: { not: null } } } } });",
      true,
    ],
    ["where: { parentCompany: { memberships: { some: { userId: actor, role: 'owner' } } } }", true],
    [
      'import { openingMembership } from "../../shared/company-standing/infrastructure/opening-membership.js";',
      true,
    ],
    ['import { effectiveRole } from "../../account/domain/services/effective-role.js";', true],
    ["await prisma.membership.findMany({ where: { companyId, role: { in: roles } } });", false],
    ["// prisma.membership.findFirst({ where: { userId } })", false],
    [
      'import { readCompanyStanding } from "../../shared/company-standing/infrastructure/read-company-standing.js";',
      false,
    ],
  ];
  const broken = cases.filter(([source, expected]) => readsCompanyRole(source) !== expected);
  if (broken.length > 0) {
    console.error(
      `✗ company-role-readers : le détecteur se trompe sur ${broken.length} cas témoin(s).`,
    );
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

selfCheck();

const root = join(ROOT, SCAN_ROOT);
if (!statSync(root, { throwIfNoEntry: false })?.isDirectory()) {
  console.error(`✗ company-role-readers : ${SCAN_ROOT} introuvable.`);
  process.exit(1);
}

const offenders = [];
const readers = new Set();
for (const file of sourceFiles(root)) {
  const rel = unix(relative(ROOT, file));
  if (
    rel.startsWith(HOME) ||
    rel.startsWith(TOOLING) ||
    !readsCompanyRole(readFileSync(file, "utf8"))
  ) {
    continue;
  }
  readers.add(rel);
  if (!ADMITTED.has(rel)) {
    offenders.push(rel);
  }
}
const stale = [...ADMITTED.keys()].filter((rel) => !readers.has(rel));

if (offenders.length + stale.length > 0) {
  for (const rel of offenders) {
    console.error(
      `✗ ${rel}\n    lit le rôle d'une personne dans une société hors de la requête partagée.`,
    );
  }
  for (const rel of stale) {
    console.error(
      `✗ ${rel}\n    est admis mais ne lit plus de rattachement : retirez-le de ADMITTED.`,
    );
  }
  console.error(
    `\n  Le rôle effectif — propre, ou hérité du principal — se lit par ${QUERY},\n` +
      "  avec `standingRole` (les gestes) ou `billingReadingRole` (la lecture de la facturation),\n" +
      "  et une liste de sites par `inheritedSiteWhere`. Recopier la condition, c'est ouvrir\n" +
      "  un site à un frère ou le fermer à son principal (plan-entrer-dans-ses-sites.md, R1).\n" +
      "  Si la lecture ne décide d'AUCUN accès, ajoutez le fichier à ADMITTED avec sa raison.\n",
  );
  process.exit(1);
}

console.log(
  `✓ company-role-readers : aucun lecteur de rôle hors de la requête partagée ` +
    `(${readers.size} lecteur(s) admis, chacun avec sa raison).`,
);
