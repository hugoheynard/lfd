#!/usr/bin/env node
/**
 * Gate : **un contrôleur n'injecte que des bus** (`CLAUDE.md` §4).
 *
 * `CommandBus` et `QueryBus`, rien d'autre. Une route qui appelle `repo.list()`
 * en direct n'a pas de cas d'usage nommé : elle ne se teste qu'à travers HTTP,
 * elle ne se réutilise pas, elle ne se journalise pas si elle devient une
 * écriture, et le prochain qui aura besoin de la même lecture la réécrira.
 *
 * La règle existait en incise et était enfreinte six fois — c'est précisément
 * ce qu'une règle en incise devient.
 *
 * ## Ce que le gate DÉTECTE, et pourquoi si étroitement
 *
 * Deux conditions pour qu'un fichier soit un contrôleur : il s'appelle
 * `*.controller.ts` **et** il porte `@Controller(`. Les deux, parce que le nom
 * seul attraperait un utilitaire de test et que le décorateur seul attraperait
 * les contrôleurs jetables déclarés dans les specs de gardes.
 *
 * Dans le constructeur, une injection est fautive quand le type déclaré est un
 * **port du domaine** — et les ports ne se devinent pas à leur nom, ils se
 * **lisent dans l'arborescence** : toute classe abstraite exportée par un
 * fichier de `domain/ports/` en est un.
 *
 * Ce détour vaut la peine. Une première rédaction listait les suffixes qu'on se
 * rappelait, `Repository` et `Reader`. Le dépôt en compte **110 répartis sur
 * 16 suffixes** : `Store`, `Directory`, `Source`, `Namer`, `Registry`,
 * `Notifier`, `Library`, `Generator`… Les deux connus n'en couvraient que 86,
 * et `SalesContextRegistry` passait au travers dans un fichier déjà signalé —
 * le gate annonçait « 1 injection » là où il y en avait deux. Une liste qu'il
 * faut compléter à chaque port inventé n'est pas une garantie.
 *
 * `PrismaService` s'y ajoute nommément : il ne vit pas dans `domain/ports/`, et
 * il est **pire** qu'un port — un contrôleur qui l'injecte ne contourne pas
 * seulement le bus, il parle à la base depuis la couche HTTP.
 *
 * C'est **plus étroit que la règle** : le §4 refuse aussi les services
 * applicatifs, et le gate n'en dit rien.
 *
 * Ce choix est délibéré. Une détection qui prendrait `*Service` ferait rougir
 * une vingtaine de contrôleurs d'un coup — les canaux Shopify, les passerelles
 * de paiement, les sondes ops — et une porte qui rougit partout le premier jour
 * se fait désactiver la semaine suivante. Le suffixe de port, lui, ne laisse
 * aucune place à la discussion : un dépôt dans un contrôleur est toujours un
 * contournement du bus. Élargir viendra quand ces cinq-là seront tombés.
 *
 * ## Le motif du SCOPE qui grandit
 *
 * Le même que `code-language` et `fold-typography` : les fichiers **drainés**
 * échouent au premier retour en arrière, tout le reste est **compté, nommé et
 * affiché**. Taire la dette restante serait pire que de ne pas avoir de gate —
 * on croirait le travail fini. Ajouter un fichier au SCOPE, c'est déclarer que
 * ses lectures ont un nom et un handler.
 *
 * Usage : `pnpm lint:controller-buses`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();

/** Les contrôleurs dont la dette est purgée. En ajouter un = l'avoir drainé. */
const SCOPE = [
  "apps/lfd-api/src/pim/ingredients/http/ingredient.controller.ts",
  // Drainé le 2026-09-02 : il injectait `B2bCatalogPushService` en direct, que
  // le suffixe de port ne voyait pas. Le geste passe désormais par
  // `PushB2bCatalogCommand`. Il entre ici pour que le retour en arrière échoue,
  // faute de quoi le nettoyage ne tient qu'à la mémoire de celui qui l'a fait.
  "apps/lfd-api/src/pim/channels/b2b-platform/products/push.controller.ts",
];

/** Tout le reste, pour que le solde restant soit visible et non silencieux. */
const WATCHED = ["apps/lfd-api/src"];

/** Ce qu'un contrôleur a le droit d'injecter, et rien d'autre. */
const ALLOWED = new Set(["CommandBus", "QueryBus"]);

/** Les classes de service qu'on refuse sans qu'elles soient des ports. */
const FORBIDDEN_SUFFIX = /PrismaService$/;

/**
 * Le suffixe de service, refusé **dans le SCOPE seulement**.
 *
 * La justification ci-dessus tient toujours pour le reste du dépôt : refuser
 * tout `*Service` partout ferait rougir une vingtaine de contrôleurs d'un coup,
 * et une porte qui rougit partout se fait désactiver. Mais un fichier DRAINÉ a
 * déjà payé ce prix — l'y autoriser rendait le drainage réversible sans bruit.
 *
 * Vérifié le 2026-09-02 : avant cette ligne, remettre
 * `constructor(private readonly pushService: B2bCatalogPushService)` dans un
 * contrôleur du SCOPE laissait la porte **verte**. Un scope qui ne protège pas
 * ce qu'il a drainé est une fausse assurance — pire qu'une porte étroite
 * assumée.
 */
const SERVICE_SUFFIX = /Service$/;

/** Une classe abstraite exportée : `export abstract class VatRateRepository`. */
const ABSTRACT_CLASS = /^export abstract class ([A-Za-z0-9_$]+)/gm;

/**
 * Les ports du domaine, **lus dans l'arborescence** plutôt qu'énumérés.
 *
 * Un port est une classe abstraite exportée par un fichier dont le chemin
 * traverse un dossier `ports/`, ou dont le nom finit par `.port.ts`. Le dépôt
 * a **trois** conventions et non une : `domain/ports/` (les 110 documentés),
 * `application/ports/` (`PricingBoardReader`) et le `.port.ts` à plat
 * (`TrafficReader`). N'en couvrir qu'une faisait disparaître deux contrôleurs
 * du décompte.
 *
 * Dériver de la structure plutôt que d'une liste de suffixes la rend juste le
 * jour où quelqu'un invente un dix-septième nom — ce qui est arrivé quinze fois.
 */
function portNames(roots) {
  const names = new Set();
  for (const root of roots) {
    for (const file of typescriptFiles(join(ROOT, root))) {
      const path = file.replace(/\\/g, "/");
      if (!path.includes("/ports/") && !path.endsWith(".port.ts")) {
        continue;
      }
      for (const found of readFileSync(file, "utf8").matchAll(ABSTRACT_CLASS)) {
        names.add(found[1]);
      }
    }
  }
  return names;
}

/** Les paramètres du constructeur, en un bloc — décorateurs `@Inject()` compris. */
const CONSTRUCTOR = /constructor\s*\(([\s\S]*?)\)\s*\{/g;

/** Un type déclaré : `private readonly rates: VatRateRepository`. */
const ANNOTATION = /:\s*([A-Za-z_$][A-Za-z0-9_$]*)/g;

/** Les commentaires cachent des exemples de code — ils ne s'injectent pas. */
function withoutComments(source) {
  const blank = (m) => m.replace(/[^\n]/g, " ");
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, lead) => lead + blank(m.slice(lead.length)));
}

function findingsIn(file, ports, strict = false) {
  const source = withoutComments(readFileSync(file, "utf8"));
  if (!source.includes("@Controller(")) {
    return [];
  }
  const found = [];
  for (const constructor of source.matchAll(CONSTRUCTOR)) {
    for (const annotation of constructor[1].matchAll(ANNOTATION)) {
      const type = annotation[1];
      const forbidden =
        ports.has(type) || FORBIDDEN_SUFFIX.test(type) || (strict && SERVICE_SUFFIX.test(type));
      if (ALLOWED.has(type) || !forbidden) {
        continue;
      }
      const line = source.slice(0, constructor.index + annotation.index).split("\n").length;
      found.push([line, type]);
    }
  }
  return found;
}

/** Tous les `.ts` sous un dossier — le parcours dont les deux autres dérivent. */
function typescriptFiles(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === "node_modules") {
      continue;
    }
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...typescriptFiles(full));
    } else if (entry.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

function controllerFiles(dir) {
  const out = [];
  for (const full of typescriptFiles(dir)) {
    if (full.endsWith(".controller.ts")) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Un fichier drainé qui a disparu est presque toujours un déplacement, et un
 * SCOPE qui pointe dans le vide ne garde plus rien en silence. On le dit.
 */
function drainedFiles(entry) {
  const full = join(ROOT, entry);
  let stats;
  try {
    stats = statSync(full);
  } catch {
    console.error(`\n✗ controller-buses\n\n  SCOPE introuvable : ${entry}\n`);
    process.exit(1);
  }
  return stats.isDirectory() ? controllerFiles(full) : [full];
}

/** Les ports, lus une fois : la liste ne se devine pas, elle se dérive. */
const PORTS = portNames(WATCHED);

let failures = 0;
for (const entry of SCOPE) {
  for (const file of drainedFiles(entry)) {
    for (const [line, type] of findingsIn(file, PORTS, true)) {
      if (failures === 0) {
        console.error("\n✗ controller-buses\n");
      }
      failures += 1;
      console.error(
        `  ${relative(ROOT, file)}:${line}  injecte ${type} — un contrôleur n'injecte que ` +
          `CommandBus et QueryBus (lecture : QueryBus ; écriture : CommandBus)`,
      );
    }
  }
}

const drained = SCOPE.map((entry) => join(ROOT, entry));
const remaining = [];
for (const dir of WATCHED) {
  for (const file of controllerFiles(join(ROOT, dir))) {
    if (drained.some((entry) => file.startsWith(entry))) {
      continue;
    }
    const found = findingsIn(file, PORTS);
    if (found.length > 0) {
      remaining.push([relative(ROOT, file), found.map(([, type]) => type)]);
    }
  }
}

if (failures) {
  console.error(
    `\n  ${failures} injection(s) hors bus dans un contrôleur drainé.\n` +
      `  Nommer la lecture (query + handler colocalisés) plutôt que rouvrir le port.\n`,
  );
  process.exit(1);
}

const total = remaining.reduce((sum, [, types]) => sum + types.length, 0);
console.log(
  `✓ controller-buses : ${SCOPE.length} contrôleur(s) drainé(s), 0 injection hors bus.\n` +
    `  Hors scope : ${remaining.length} contrôleur(s), ${total} injection(s) — compté, pas ignoré.`,
);
for (const [file, types] of remaining) {
  console.log(`    ${file}  (${types.join(", ")})`);
}
