#!/usr/bin/env node
/**
 * Gate : **un jour se convertit en instant à l'heure de Paris**, jamais en UTC.
 *
 * Un `<input type="date">` rend un jour nu — `2026-01-01`. L'API attend un
 * instant. Entre les deux, le code écrivait :
 *
 *     new Date(`${day}T00:00:00.000Z`)
 *
 * c'est-à-dire **minuit UTC**. À Paris, la fenêtre s'ouvrait donc à 01 h 00 en
 * hiver et 02 h 00 en été. Pendant ces une à deux heures, le client payait le
 * tarif d'avant — et **rien ne le signalait** : la trace figée sur sa commande
 * disait la vérité, le prix appliqué était bien celui de la règle en vigueur à
 * cet instant-là. C'était le trou T7, ouvert des mois.
 *
 * Ce qui rend ce défaut particulièrement docile à une porte : il ne se voit pas
 * l'après-midi, et un tarif se pose rarement à trois heures du matin. Une
 * relecture ne l'attrape pas parce qu'il n'y a rien à voir.
 *
 * ## Ce que la porte cherche
 *
 * Une **interpolation** dans un instant UTC codé en dur — un jour qu'on colle à
 * `T00:00:00.000Z`. Une date entièrement littérale (`"2026-01-01T00:00:00.000Z"`)
 * ne la déclenche pas : c'est une constante, pas une conversion.
 *
 * ⚠️ Cette porte lit les **gabarits littéraux**, que `clock-port` efface au
 * contraire avant de chercher. Les deux ne peuvent pas partager leur nettoyage.
 *
 * Usage : `pnpm lint:business-day` (branché dans `lint:gates`).
 *
 * ⚠️ Branchée dans le MÊME commit qui l'écrit, et sur un dépôt propre — cf.
 * l'avertissement de `no-direct-env.mjs`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
/**
 * **Le périmètre : là où un jour devient une FENÊTRE DE VALIDITÉ.**
 *
 * Volontairement étroit, et la raison est le seul critère que cette porte sache
 * appliquer : une fenêtre tarifaire est comparée à **l'horloge**, donc son
 * décalage se paie en euros. Ailleurs dans le dépôt, un jour converti en minuit
 * UTC est presque toujours une **journée de service** — une clé, comparée à
 * d'autres clés écrites de la même façon, jamais à maintenant.
 *
 * Élargir la porte sans distinguer les deux la rendrait ingérable : au
 * 2026-09-08, **dix-neuf** sites hors tarification convertissent un jour en
 * minuit UTC (jours de livraison, semaines de cohorte, `IsoDate` des
 * abonnements, date d'acceptation d'un mandat). Aucun n'est un défaut en soi ;
 * changer l'un d'eux sans son écriture symétrique en serait un, et ce serait
 * une migration de données.
 *
 * Ce n'est donc pas une couverture partielle par paresse : c'est la portée sur
 * laquelle le critère « se compare-t-il à l'horloge ? » répond oui à coup sûr.
 */
const SCAN_ROOTS = [
  "apps/lfc-B2B-admin-frontend/src/app/b2b/tarification",
  "apps/lfc-B2B-admin-frontend/src/app/commercial/tarification",
  "apps/lfc-B2B-admin-frontend/src/app/fiche-client/tarifs",
  "apps/lfd-api/src/b2b/pricing",
];
const SKIP_DIRS = new Set(["node_modules", "dist", "client", "coverage", ".turbo"]);

/**
 * Un gabarit qui **interpole** quelque chose et le colle à un minuit UTC.
 *
 * `T00:00`, avec ou sans secondes ni millièmes, suivi d'un `Z`. Le `${` est ce
 * qui distingue une conversion d'une constante.
 */
const DAY_TO_UTC = /`[^`]*\$\{[^`]*T00:00(?::00)?(?:\.\d+)?Z[^`]*`/u;

/**
 * Les seuls endroits autorisés, **et pourquoi**.
 *
 * Le critère de tri tient en une question : *cet instant sort-il de la
 * fonction ?* S'il part vers l'API, s'il est comparé à une fenêtre de validité
 * ou s'il décide d'un prix, il doit être à l'heure de Paris. S'il sert à
 * fabriquer une étiquette et meurt là, l'heure ne change rien.
 */
const ALLOWED = [
  // Étiquette de date : `toLocaleDateString` sur un jour nu. L'instant ne
  // quitte pas la fonction et n'est comparé à rien.
  //
  // ⚠️ Réserve écrite plutôt que tue : pour un lecteur situé à l'OUEST de UTC,
  // minuit UTC retombe la veille et l'étiquette afficherait le mauvais jour. Le
  // back-office est un outil de station française ; le jour où il ne l'est
  // plus, ces deux lignes sont à reprendre.
  "src/app/b2b/tarification/pricing-format.ts",
  "src/app/b2b/tarification/frise/timeline-axis/timeline-axis.ts",
];

function isAllowed(relPath) {
  const unix = relPath.split("\\").join("/");
  return ALLOWED.some((suffix) => unix.endsWith(suffix));
}

/** Les commentaires partent : une porte qui lit la prose ne garde rien. */
function withoutComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/^\s*\/\/.*$/gmu, "");
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return SKIP_DIRS.has(entry.name) ? [] : sourceFiles(path);
    }
    if (!entry.name.endsWith(".ts") || entry.name.endsWith(".spec.ts")) {
      return [];
    }
    // Une fixture a le droit d'écrire l'instant qu'elle veut : elle ne convertit
    // pas la saisie de quelqu'un.
    return path.includes("__tests__") ? [] : [path];
  });
}

const offences = [];
let scanned = 0;
for (const scanRoot of SCAN_ROOTS) {
  const root = join(ROOT, scanRoot);
  if (!statSync(root, { throwIfNoEntry: false })?.isDirectory()) {
    console.error(`✗ business-day : ${scanRoot} introuvable.`);
    process.exit(1);
  }
  for (const file of sourceFiles(root)) {
    scanned += 1;
    const rel = relative(ROOT, file);
    if (isAllowed(rel)) {
      continue;
    }
    const source = withoutComments(readFileSync(file, "utf8"));
    source.split("\n").forEach((line, index) => {
      if (DAY_TO_UTC.test(line)) {
        offences.push({ rel, line: index + 1, text: line.trim() });
      }
    });
  }
}

if (offences.length > 0) {
  console.error("\n✗ business-day\n");
  for (const offence of offences) {
    console.error(`  ${offence.rel}:${offence.line}`);
    console.error(`    ${offence.text}`);
  }
  console.error(
    `\n  ${offences.length} conversion(s) d'un jour en minuit UTC.\n` +
      "  Un commercial qui écrit « à partir du 1er janvier » veut dire minuit\n" +
      "  CHEZ LUI. Passer par `businessDayStart` (front) ou `localToInstant`\n" +
      "  (@lfd/contracts), qui connaissent le passage à l'heure d'été.\n",
  );
  process.exit(1);
}

console.log(
  `✓ business-day : ${scanned} fichier(s) — aucun jour converti en minuit UTC.\n` +
    `  Dérogations déclarées : ${ALLOWED.length} (étiquettes de date, l'instant ne sort pas)`,
);
