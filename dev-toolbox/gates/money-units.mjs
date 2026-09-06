#!/usr/bin/env node
/**
 * Gate : **un montant en centimes ne se dérive pas d'un prix en millicentimes
 * par une multiplication écrite à la main.**
 *
 * ## Ce qui l'a motivé
 *
 * Le 2026-09-05, l'audit du calcul du panier a trouvé ceci, en service depuis
 * l'ouverture commerciale du back-office :
 *
 * ```ts
 * readonly subtotalCents = computed(() =>
 *   this.pricedLines().reduce((total, line) => total + line.unitPriceMillicents * line.quantity, 0),
 * );
 * ```
 *
 * Le champ est en **millicentimes** (10⁻⁵ €), le nom promet des **centimes**, et
 * deux écrans l'affichaient par `formatCents`, qui divise par cent. Dix
 * croissants à 2,00 € se lisaient **20 000,00 €**. Le test était vert : sa
 * fixture mettait `200` — une valeur en centimes — dans un champ de
 * millicentimes. Le test et le code étaient faux **ensemble**, ce qui est la
 * seule façon pour un défaut d'unité de survivre à une suite.
 *
 * Le même idiome était écrit **trois fois** dans le dépôt. Deux tombaient sur un
 * formateur en millicentimes, donc rendaient la bonne valeur sous un nom faux.
 * Ce n'est pas de la chance : un idiome fautif recopié n'attend qu'un site pour
 * atterrir du mauvais côté.
 *
 * ## La règle, dans les DEUX sens
 *
 * Un nom qui finit par `Cents` (et non `Millicents`) ne peut pas recevoir une
 * expression qui mentionne `Millicents`, **sauf** à passer par l'une des
 * conversions déclarées de `@lfd/money` — au premier chef `lineTotalCents`, qui
 * arrondit **une fois par ligne**, ce qui est l'autre moitié du défaut ci-dessus.
 *
 * Et **réciproquement** : un nom en `*Millicents` ne peut pas recevoir une
 * expression qui parle de centimes.
 *
 * ⚠️ **Ce second sens n'était pas dans la première version**, et la raison
 * écrite pour l'exclure — « ça se joue à la frontière d'un formulaire, où le nom
 * de la source ne dit rien » — s'est révélée fausse au premier passage de la
 * porte. La source s'appelle `centsOf`, et elle dit tout. C'est ce sens qui a
 * trouvé `D10` : un prix de mercuriale enregistré au millième de ce qui est
 * tapé, depuis un renommage du 2026-08-31 qui a changé le nom d'un champ sans
 * convertir sa valeur. **C'est le sens qui ÉCRIT.**
 *
 * ## 🔴 Pourquoi elle ne se vérifie pas ligne par ligne
 *
 * Dans l'exemple, le nom et le `Millicents` fautif sont sur **deux lignes
 * différentes**. Une porte par ligne n'aurait donc pas attrapé le défaut qui l'a
 * fait écrire — c'est-à-dire rien. Chaque site de liaison est suivi jusqu'à la
 * fin de son expression, parenthèses équilibrées.
 *
 * ## Le motif de la dette comptée
 *
 * Le même que `no-type-escapes` : les sites connus sont **déclarés**, et la liste
 * ne peut que se vider. Un site hors liste fait échouer ; un site nettoyé mais
 * encore inscrit fait échouer aussi — sans quoi la liste finirait par mentir sur
 * ce qui reste.
 *
 * ## Ce qu'elle ne tient pas, et c'est écrit
 *
 * - **Ce qu'aucun nom ne dit.** La porte croit les noms : elle vérifie qu'ils
 *   sont cohérents entre eux, jamais que la VALEUR est dans l'unité annoncée.
 *   Un champ `priceMillicents` rempli en centimes par un `parseFloat` anonyme
 *   lui est invisible. C'est la limite de fond, et c'est ce qu'un type nominal
 *   `Millicents` / `Cents` fermerait — le cran au-dessus.
 * - **Une expression mixte** — `lineTotalCents(a, b) + autre.prixMillicents`
 *   passe, parce que la conversion déclarée est cherchée par présence. C'est le
 *   prix d'une porte qui lit du texte plutôt qu'un arbre typé.
 * - **L'affichage.** `formatCents(this.subtotalCents())` est invisible ici :
 *   c'est la SOURCE d'un nom qui est surveillée, pas ce qu'on en fait ensuite.
 *   Sur `D1`, la source suffisait — corriger la source corrige les deux écrans.
 *
 * Usage : `pnpm lint:money-units` (branché dans `lint:gates`).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();

/** Là où de l'argent circule. Le client Prisma est généré, il ne compte pas. */
const WATCHED = [
  "apps/lfd-api/src",
  "apps/lfd-api/test",
  "apps/lfc-B2B-admin-frontend/src",
  "apps/lfc-B2B-platform-frontend/src",
  "packages",
];

/**
 * Les seules façons légitimes de traverser du millicentime vers le centime.
 *
 * `lineTotalCents` est la **bonne** réponse dans presque tous les cas : elle
 * multiplie et arrondit une fois, ce que le serveur fait sur la ligne de
 * commande. Les autres existent pour les cas où il n'y a pas de quantité.
 */
const CONVERTERS = ["lineTotalCents", "centsFromMillicents", "unitPriceCents", "roundToCents"];

/**
 * La dette connue, site par site — `chemin relatif : nom lié`.
 *
 * **Quatorze au premier passage, et un seul est un défaut de valeur.** La clé
 * est le fichier et le nom, pas la ligne : elle survit à un déplacement, et un
 * lot qui nettoie un fichier retire ses entrées d'un bloc.
 *
 * Le tri est fait, site par site, et écrit ci-dessous plutôt que promis :
 * `draft-grid.ts` écrit un prix faux en base, les treize autres rendent la
 * **bonne valeur** sous un nom qui ment. Confondre les deux ferait de cette
 * liste un tas, et un tas ne se vide pas.
 */
const ADMIN = "apps/lfc-B2B-admin-frontend/src/app";

const KNOWN = new Set([
  // ── 🔴 UN VRAI DÉFAUT DE VALEUR, et il ÉCRIT. ───────────────────────────────
  //
  // `centsOf('2,10')` rend 210 CENTIMES, posés dans `unitPriceMillicents` du
  // gabarit de mercuriale. Le serveur en fait une règle `replace`
  // (`template-to-rules.ts:44`), donc un prix négocié de 0,0021 € au lieu de
  // 2,10 €. La relecture (`draftFromLines`) divise par cent à son tour : l'écran
  // se relit juste, et c'est la BASE qui porte un millième.
  //
  // Origine : le renommage `unitPriceCents` → `unitPriceMillicents` du
  // 2026-08-31 (`0e2e2dd2`), qui a changé le nom sans convertir la valeur.
  //
  // Il n'est PAS corrigé ici, et c'est délibéré : le corriger demande de
  // trancher l'unité de chaque appelant de `centsOf` / `eurosField`, et pose la
  // question des lignes DÉJÀ enregistrées — une décision de production, donc
  // celle d'Hugo. Cf. `D10` de `audit-calcul-du-panier-et-du-prix.md`.
  `${ADMIN}/commercial/tarification/grille/draft-grid.ts:unitPriceMillicents`,

  // ── Des NOMS qui mentent, sur des valeurs justes. ───────────────────────────
  //
  // Toute la famille `commercial/tarification` transporte des millicentimes dans
  // des champs nommés `*Cents`, et les affiche par `formatEuros`, qui attend des
  // millicentimes. Ce qui est faux est le nom — plus le fait qu'un TOTAL s'y
  // montre avec cinq décimales, quand un montant s'arrête au centime.
  //
  // Deux fonctions portent le mensonge à la source : `floorCentsOf` rend des
  // millicentimes, `unitPriceCentsAt` aussi. Les renommer referme la moitié de
  // cette liste d'un coup. Lot `P3`.
  `${ADMIN}/commercial/tarification/grille/mercuriale-row.ts:catalogCents`,
  `${ADMIN}/commercial/tarification/grille/mercuriale-row.ts:roomCents`,
  `${ADMIN}/commercial/tarification/grille/mercuriale-row.ts:floorMillicents`,
  `${ADMIN}/commercial/tarification/grille/mercuriale-row.ts:finalMillicents`,
  `${ADMIN}/commercial/tarification/simulation/locate-simulation.ts:catalogCents`,
  `${ADMIN}/commercial/tarification/simulation/locate-simulation.ts:floorMillicents`,
  `${ADMIN}/commercial/tarification/simulation/mercuriale-mix.ts:catalogCents`,
  `${ADMIN}/commercial/tarification/simulation/mercuriale-mix.ts:floorMillicents`,
  `${ADMIN}/commercial/tarification/simulation/revenue-model.ts:catalogCents`,
  `${ADMIN}/commercial/tarification/simulation/article-simulation/article-simulation.ts:appliedFixedCents`,
  `${ADMIN}/commercial/tarification/simulation/__tests__/pricing-regime.spec.ts:unitPriceMillicents`,

  // Les trois du simulateur de tarification, relevés par l'audit (`D6`). Mêmes
  // symptômes, même remède : un renommage, pas un calcul.
  `${ADMIN}/b2b/tarification/simulateur/quote-bench.ts:totalCents`,
  `${ADMIN}/b2b/tarification/simulateur/commitment-bench.ts:lineTotalCents`,
]);

/** Commentaires et chaînes deviennent du blanc : ce sont des mots, pas du code. */
function codeOnly(source) {
  const blank = (m) => m.replace(/[^\n]/g, " ");
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, lead) => lead + blank(m.slice(lead.length)))
    .replace(/"(?:[^"\\\n]|\\.)*"/g, blank)
    .replace(/'(?:[^'\\\n]|\\.)*'/g, blank)
    .replace(/`(?:[^`\\]|\\.)*`/gs, blank);
}

/**
 * Un nom qui promet des centimes : finit par `Cents`, et pas par `Millicents`.
 *
 * Le `=` exclut `==`, `===` et `=>` — sans quoi un paramètre de flèche nommé
 * `…Cents` ouvrirait une expression qui n'est pas la sienne.
 */
const BINDING = /\b([A-Za-z_$][A-Za-z0-9_$]*?(?<!Milli)Cents)\s*(?:=(?![=>])|:)/g;

/**
 * Le sens INVERSE — un nom qui promet des millicentimes, nourri de centimes.
 *
 * 🔴 **C'est celui qui écrit**, et il n'était pas dans la première version de
 * cette porte. La raison écrite pour l'exclure — « ça se joue à la frontière
 * d'un formulaire, où le nom de la source ne dit rien » — s'est révélée fausse
 * dès le premier passage : la source s'appelle `centsOf`, et elle dit tout.
 *
 * Ce que ce sens attrape est un **renommage mécanique qui traverse une unité**.
 * Le 2026-08-31, `unitPriceCents` est devenu `unitPriceMillicents` dans la
 * grille de mercuriale sans que la valeur soit convertie ; l'écran est resté
 * cohérent avec lui-même — il relit par la conversion inverse, également fausse
 * — et c'est la BASE qui porte un millième du prix tapé.
 */
const REVERSE = /\b([A-Za-z_$][A-Za-z0-9_$]*Millicents)\s*(?:=(?![=>])|:)/g;

/** Une mention de centimes qui n'est pas une mention de millicentimes. */
const CENTS_MENTION = /(?<!Milli)(?<!milli)[Cc]ents/;

/**
 * **Un appel dont le NOM déclare qu'il rend des millicentimes** — `htMillicentsOf(…)`.
 *
 * Une fonction qui annonce son unité dans son nom est une conversion déclarée,
 * même si ses arguments parlent de centimes : c'est précisément son travail.
 * Sans cette dérogation, la porte accuserait la seule ligne du dépôt qui fait la
 * traversée correctement, et on apprendrait à l'ignorer.
 *
 * L'appel se reconnaît à sa parenthèse : `x.canonicalMillicents` n'en est pas un.
 */
const MILLICENTS_CALL = /[A-Za-z_$][A-Za-z0-9_$]*Millicents[A-Za-z0-9_$]*\s*\(/;

/**
 * L'expression liée, suivie jusqu'à son terme.
 *
 * On avance en comptant les parenthèses, crochets et accolades ; on s'arrête au
 * premier `;` ou `,` de profondeur nulle, ou sur la fermeture qui nous sort du
 * bloc englobant. C'est ce qui permet d'attraper un `computed(() => …)` dont le
 * corps s'étale sur quatre lignes.
 */
function expressionAt(source, start) {
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    const char = source[i];
    if (char === "(" || char === "[" || char === "{") {
      depth += 1;
    } else if (char === ")" || char === "]" || char === "}") {
      if (depth === 0) {
        return source.slice(start, i);
      }
      depth -= 1;
    } else if (depth === 0 && (char === ";" || char === ",")) {
      return source.slice(start, i);
    }
  }
  return source.slice(start);
}

function findingsIn(file) {
  const source = codeOnly(readFileSync(file, "utf8"));
  const found = [];
  const scan = (pattern, guilty, allowed) => {
    for (const match of source.matchAll(pattern)) {
      const expression = expressionAt(source, match.index + match[0].length);
      if (!guilty(expression) || allowed.some((name) => expression.includes(name))) {
        continue;
      }
      found.push({ name: match[1], line: source.slice(0, match.index).split("\n").length });
    }
  };
  scan(BINDING, (expression) => expression.includes("Millicents"), CONVERTERS);
  scan(
    REVERSE,
    (expression) => CENTS_MENTION.test(expression) && !MILLICENTS_CALL.test(expression),
    // `roundToCents` porte un nom de centimes et travaille sur un rationnel dont
    // l'unité est celle qu'on lui a donnée : sur la chaîne de prix, elle rend
    // des millicentimes. Le nom vient de `@lfd/money` ; le corriger là-bas est
    // un autre chantier que celui de cette porte.
    ["millicentsFromCents", "roundToCents", "roundToMillicents"],
  );
  return found;
}

function tsFiles(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === "dist" || entry === "client") {
      continue;
    }
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...tsFiles(full));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

const stray = [];
const seen = new Set();

for (const dir of WATCHED) {
  for (const file of tsFiles(join(ROOT, dir))) {
    const path = relative(ROOT, file);
    for (const { name, line } of findingsIn(file)) {
      const key = `${path}:${name}`;
      if (KNOWN.has(key)) {
        seen.add(key);
        continue;
      }
      stray.push(`${path}:${String(line)}  ${name}`);
    }
  }
}

const cleaned = [...KNOWN].filter((key) => !seen.has(key));
let failed = false;

if (stray.length > 0) {
  failed = true;
  console.error("\n❌ Un montant en centimes dérivé d'un prix en millicentimes :\n");
  for (const where of stray.sort()) {
    console.error(`   ${where}`);
  }
  console.error(
    `\n   Le facteur est MILLE, et il ne se voit pas : la multiplication rend\n` +
      `   un nombre plausible. Passer par ${CONVERTERS[0]}(prix, quantité), qui\n` +
      `   arrondit une fois par ligne — comme la commande.\n`,
  );
}

if (cleaned.length > 0) {
  failed = true;
  console.error("\n❌ Sites nettoyés, encore inscrits à la dette :\n");
  for (const key of cleaned.sort()) {
    console.error(`   ${key}`);
  }
  console.error("\n   Les retirer de KNOWN — la liste se vide, elle ne ment pas.\n");
}

if (failed) {
  process.exit(1);
}

console.log(
  KNOWN.size === 0
    ? "✓ money-units : aucun centime dérivé d'un millicentime, et aucune dette."
    : `✓ money-units : 0 site neuf, ${String(KNOWN.size)} déclaré(s) — compté, en baisse seulement.`,
);
