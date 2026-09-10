#!/usr/bin/env node
/**
 * Gate : un attribut posé sur un composant fold **existe** chez fold.
 *
 * ## La panne
 *
 * Un attribut STATIQUE inconnu sur un composant Angular est du HTML valide.
 * Angular l'ignore en silence : il n'y a ni erreur de compilation, ni
 * avertissement, ni test rouge. Le composant rend son défaut, et le seul témoin
 * est l'écran — que personne ne regarde pour un attribut qu'on croit avoir posé.
 *
 * Une liaison se fait attraper (`[variant]="x"` échoue si `variant` n'est pas
 * une entrée). Un attribut nu, non : c'est exactement l'écriture la plus
 * courante, celle des valeurs constantes.
 *
 * Ce n'est pas une hypothèse. Le 2026-09-10, l'écran Catalogue B2B portait
 * `variant="ghost"` sur un `foldButton` — `variant` n'existe pas (c'est
 * `emphasis` et `intent`), et `ghost` n'est une valeur d'aucun des deux. Le
 * bouton « Masquer » rendait donc en SOLIDE PRIMAIRE, le plus fort de l'écran,
 * à côté d'un éditeur de prix que personne ne voyait. Vingt-et-une occurrences
 * de deux familles ont été corrigées ce jour-là ; six familles restent, listées
 * plus bas.
 *
 * ## Ce que la porte lit
 *
 * 🔴 **Les entrées viennent des TYPES PUBLIÉS de fold**, jamais d'une liste
 * écrite ici. Une liste en dur serait la faute même que cette porte existe pour
 * empêcher : elle vieillirait sans bruit à la première montée de version, et
 * dirait alors le contraire de la vérité. `fold-ng.d.ts` porte, pour chaque
 * composant et directive, son sélecteur, ses entrées, ses sorties et ses
 * emplacements de projection — tout est déduit de là.
 *
 * ## Ce qu'elle ne compte pas, et pourquoi
 *
 * - les **liaisons** `[x]`, `(x)`, `[(x)]`, les références `#x`, les
 *   directives structurelles `*x`, les blocs `@x` : Angular les vérifie déjà ;
 * - les **attributs globaux** du HTML (`class`, `id`, `title`, `type`…),
 *   `aria-*` et `data-*` : ils s'appliquent à l'élément hôte, comme partout ;
 * - les **emplacements de projection** (`actions`, `cardHeader`,
 *   `sectionActions`, `railPrimary`…), qui sont des attributs NUS légitimes.
 *   Ils sont déduits des `ngContentSelectors` de tous les composants fold ;
 * - une valeur d'attribut qui contient un `=` — c'est de la prose, pas un
 *   attribut de plus.
 *
 * ## Le cliquet
 *
 * La dette de départ est déclarée fichier par fichier, et elle ne peut que
 * décroître : un fichier hors liste qui gagne un attribut inconnu échoue, un
 * fichier de la liste qui n'en a plus échoue aussi — pour que la liste se vide
 * au lieu de mentir. Même mécanique que `lint:no-type-escapes`.
 *
 * Usage : `pnpm lint:fold-unknown-attributes` (branché en CI).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const ROOT = process.cwd();

/**
 * Résolution depuis une app front et non depuis la racine : `fold-ng` est une
 * dépendance des apps, pas du dépôt. Toutes pointent la même version — le
 * `catalog:` de `pnpm-workspace.yaml` l'épingle une fois pour toutes.
 */
const FOLD_HOST = "apps/lfc-B2B-admin-frontend/package.json";

/**
 * **La dette du 2026-09-10**, six familles, chacune vérifiée contre les entrées
 * déclarées. Elles ne se corrigent pas mécaniquement — un titre de callout
 * devient du contenu projeté, ce qui est une décision par site —, d'où la liste
 * plutôt qu'un balayage bâclé.
 *
 * La valeur est le NOMBRE d'attributs inconnus attendus dans le fichier. Un de
 * plus ou un de moins, et la porte le dit.
 */
const DEBT = new Map([
  // `fold-callout` ne déclare que variant/appearance/icon/announce. `title`
  // rend donc une INFOBULLE native au lieu d'un titre, et `tone` n'existe pas
  // (c'est `variant`). Le titre devient du contenu projeté : une décision par
  // site, pas une substitution.
  [
    "apps/lfc-B2B-admin-frontend/src/app/commandes/nouvelle-commande/nouvelle-commande-page.html",
    3,
  ],
  [
    "apps/lfc-B2B-admin-frontend/src/app/commandes/nouvelle-commande/panier-commande/panier-commande.html",
    1,
  ],
  ["apps/lfc-B2B-admin-frontend/src/app/dev/seed-page/seed-page.html", 1],
  ["apps/lfc-B2B-admin-frontend/src/app/fiche-client/commandes/commandes-page.html", 1],
  ["apps/lfc-B2B-admin-frontend/src/app/fiche-client/tarifs/tarifs-page.html", 2],
  ["apps/lfc-B2B-platform-frontend/src/app/legacy/commandes/reglement-page/reglement-page.html", 1],

  // `fold-input` ne déclare pas `inputmode` : l'indication de clavier mobile
  // reste sur l'élément hôte et n'atteint jamais le champ. C'est une limite de
  // fold, pas une faute de frappe — la sortie demande une entrée chez fold, ou
  // un aveu écrit. `readonly`, en revanche, est une faute de casse : `readOnly`.
  ["apps/lfc-B2B-admin-frontend/src/app/b2b/tarification/floor-panel/floor-panel.html", 1],
  ["apps/lfc-B2B-admin-frontend/src/app/b2b/tarification/ladder-panel/ladder-panel.html", 2],
  ["apps/lfc-B2B-admin-frontend/src/app/b2b/tarification/rule-panel/rule-panel.html", 1],
  ["apps/lfc-B2B-admin-frontend/src/app/b2b/tarification/simulateur/simulateur-page.html", 3],
  [
    "apps/lfc-B2B-platform-frontend/src/app/client/nouvelle-commande/commande-page/address-dialog/address-dialog.html",
    2,
  ],

  // `fold-inline-confirm` : c'est `labels` (un objet partiel) et `intent`.
  [
    "apps/lfc-B2B-admin-frontend/src/app/commercial/calendrier/customer-sheet/customer-sheet.html",
    5,
  ],
  [
    "apps/lfc-B2B-admin-frontend/src/app/reglages/retraits-livraisons/cutoffs-section/cutoffs-section.html",
    1,
  ],

  // `fold-badge` ne déclare que content/radius/variant.
  [
    "apps/lfc-B2B-admin-frontend/src/app/commercial/cockpit/pinned-accounts/pinned-accounts.html",
    1,
  ],
  ["apps/lfc-B2B-admin-frontend/src/app/commercial/cockpit/play-queue/play-queue.html", 1],

  // `fold-element-title` : c'est `variant="eyebrow"`.
  [
    "apps/lfc-B2B-admin-frontend/src/app/commercial/calendrier/rendez-vous/rendez-vous-page.html",
    1,
  ],
]);

/** Ce que tout élément HTML porte légitimement, fold ou non. */
const GLOBAL_ATTRIBUTES = new Set([
  "accept",
  "accesskey",
  "alt",
  "autocapitalize",
  "autocomplete",
  "autofocus",
  "capture",
  "checked",
  "cite",
  "class",
  "contenteditable",
  "controls",
  "coords",
  "datetime",
  "decoding",
  "dir",
  "dirname",
  "disabled",
  "download",
  "draggable",
  "enctype",
  "enterkeyhint",
  "for",
  "form",
  "height",
  "hidden",
  "href",
  "hreflang",
  "id",
  "inert",
  "inputmode",
  "is",
  "itemid",
  "itemprop",
  "itemref",
  "itemscope",
  "itemtype",
  "lang",
  "list",
  "loading",
  "loop",
  "max",
  "maxlength",
  "media",
  "method",
  "min",
  "minlength",
  "multiple",
  "muted",
  "name",
  "novalidate",
  "pattern",
  "ping",
  "placeholder",
  "playsinline",
  "popover",
  "poster",
  "preload",
  "readonly",
  "referrerpolicy",
  "rel",
  "required",
  "reversed",
  "role",
  "rows",
  "sandbox",
  "scope",
  "selected",
  "shape",
  "size",
  "slot",
  "span",
  "spellcheck",
  "src",
  "srcset",
  "start",
  "step",
  "style",
  "tabindex",
  "target",
  "title",
  "translate",
  "type",
  "usemap",
  "value",
  "width",
  "wrap",
]);

/**
 * Les attributs natifs que fold **revendique aussi** comme entrées.
 *
 * Sur une balise native (`<button foldButton type="submit">`), ils gardent leur
 * sens HTML et sont légitimes. Sur un ÉLÉMENT fold (`<fold-badge size="sm">`),
 * ils ne veulent plus rien dire : un attribut natif posé sur un composant ne
 * traverse pas jusqu'au contrôle qu'il enveloppe. C'est le cœur de la nuance —
 * `size` sur `fold-badge` est inerte, `type` sur `<button foldButton>` ne l'est
 * pas.
 *
 * Ils sont donc retirés du régime strict et réintroduits dans le régime
 * prudent, jamais l'inverse.
 */
const NATIVE_BUT_CLAIMED = new Set([
  "size",
  "title",
  "type",
  "value",
  "disabled",
  "placeholder",
  "name",
]);
for (const claimed of NATIVE_BUT_CLAIMED) {
  GLOBAL_ATTRIBUTES.delete(claimed);
}

/**
 * Les directives d'Angular qu'une balise porte couramment à côté d'une
 * directive fold. La porte ne lit pas les types d'Angular : ces quelques noms
 * se croisent avec des entrées fold (`fold-back-link` déclare `routerLink`), et
 * sans eux le régime prudent reprocherait un lien à chaque bouton-lien.
 */
const ANGULAR_DIRECTIVES = new Set([
  "routerLink",
  "routerLinkActive",
  "routerLinkActiveOptions",
  "ngProjectAs",
  "ngSrc",
]);

/** Un attribut global qu'on ne peut jamais reprocher, même à un composant. */
const ALWAYS_ALLOWED = new Set(["class", "id", "style", "hidden", "slot", "tabindex", "role"]);

/**
 * Découpe les paramètres génériques d'une déclaration Angular, en respectant
 * les accolades, crochets et chevrons imbriqués.
 *
 * Écrit à la main plutôt que par une expression régulière : un `{ "alias": … }`
 * contient des virgules, et une regex les prendrait pour des séparateurs.
 */
function splitGenerics(source, from) {
  const args = [];
  let depth = 0;
  let start = from;
  for (let i = from; i < source.length; i += 1) {
    const c = source[i];
    // 🔴 Les GUILLEMETS d'abord. Le sélecteur de `foldButton` s'écrit
    // `"button[foldButton], a[foldButton]"` : sa virgule est du texte, pas un
    // séparateur de paramètres. Sans ce saut, tous les paramètres suivants sont
    // décalés d'un cran, les entrées de la directive tombent dans la case des
    // sorties, et la porte reproche alors à `foldButton` ses propres entrées.
    if (c === '"' || c === "'") {
      const end = source.indexOf(c, i + 1);
      i = end === -1 ? source.length : end;
      continue;
    }
    if (c === "<" || c === "{" || c === "[" || c === "(") {
      depth += 1;
    } else if (c === "}" || c === "]" || c === ")") {
      depth -= 1;
    } else if (c === ">") {
      if (depth === 0) {
        args.push(source.slice(start, i));
        return args;
      }
      depth -= 1;
    } else if (c === "," && depth === 0) {
      args.push(source.slice(start, i));
      start = i + 1;
    }
  }
  return args;
}

/** Ce que fold déclare : par sélecteur, ses entrées ; et tous ses emplacements. */
function declaredByFold() {
  const require = createRequire(join(ROOT, FOLD_HOST));
  const types = join(dirname(require.resolve("fold-ng/package.json")), "types", "fold-ng.d.ts");
  const source = readFileSync(types, "utf8");

  /** Sélecteur d'élément (`fold-card`) → entrées déclarées. */
  const byElement = new Map();
  /** Sélecteur d'attribut (`foldButton`) → entrées déclarées. */
  const byAttribute = new Map();
  /** Tous les emplacements de projection, en attributs nus (`actions`). */
  const slots = new Set();
  let declarations = 0;

  for (const match of source.matchAll(/ɵɵ(Component|Directive)Declaration</gu)) {
    const args = splitGenerics(source, match.index + match[0].length);
    const [, rawSelector, , rawInputs, rawOutputs, , rawSlots] = args;
    if (rawSelector === undefined || !rawSelector.includes('"')) {
      continue;
    }
    declarations += 1;
    const names = new Set([
      ...[...(rawInputs ?? "").matchAll(/"([^"]+)":\s*\{\s*"alias"/gu)].map((m) => m[1]),
      ...[...(rawOutputs ?? "").matchAll(/"([^"]+)":\s*"/gu)].map((m) => m[1]),
    ]);

    // 🔴 **Uniquement si c'est bien un TABLEAU.** Le nombre de paramètres varie
    // d'une déclaration à l'autre ; quand la 7ᵉ case n'est pas la liste des
    // emplacements mais une carte d'entrées, une lecture naïve y récolte des
    // noms comme `size` ou `label` et les autorise alors PARTOUT. La porte
    // devient silencieuse sur les cas qu'elle existe pour attraper — c'est
    // arrivé, et seule une relecture des cas disparus l'a montré.
    const declaredSlots = (rawSlots ?? "").trim();
    if (declaredSlots.startsWith("[")) {
      for (const slot of declaredSlots.matchAll(/"(?:\[)?([a-zA-Z][\w-]*)(?:\])?"/gu)) {
        slots.add(slot[1]);
      }
    }

    // Un sélecteur composé (`button[foldButton], a[foldButton]`) porte plusieurs
    // formes du même contrat : chacune reçoit les mêmes entrées.
    for (const form of rawSelector.replaceAll('"', "").split(",")) {
      const selector = form.trim();
      if (selector === "" || selector === "never") {
        continue;
      }
      const attribute = /^[a-zA-Z][\w-]*?\[([a-zA-Z][\w-]*)\]$|^\[([a-zA-Z][\w-]*)\]$/u.exec(
        selector,
      );
      if (attribute !== null) {
        const name = attribute[1] ?? attribute[2];
        byAttribute.set(name, new Set([...(byAttribute.get(name) ?? []), ...names]));
        continue;
      }
      const element = /^([a-zA-Z][\w-]*)/u.exec(selector);
      if (element !== null && element[1].startsWith("fold")) {
        byElement.set(element[1], new Set([...(byElement.get(element[1]) ?? []), ...names]));
      }
    }
  }
  return { byElement, byAttribute, slots, declarations };
}

/** Les gabarits suivis par git : fichiers `.html` et `template:` en ligne. */
function trackedTemplates() {
  const patterns = ["apps/*.html", "apps/*.ts", "packages/*.html", "packages/*.ts"];
  return execFileSync("git", ["ls-files", ...patterns], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\n")
    .filter((file) => file !== "" && !file.endsWith(".spec.ts") && existsSync(file));
}

/**
 * Les attributs d'une balise ouvrante, en respectant les guillemets.
 *
 * Découpé à la main pour une raison précise : une valeur peut contenir un `=`
 * (« Churn = résiliées ÷ base » dans un texte d'aide), et une regex naïve y
 * lirait un attribut de plus. C'était la moitié des faux positifs du prototype.
 */
function attributesOf(tag) {
  const found = [];
  let i = 0;
  while (i < tag.length) {
    const c = tag[i];
    if (c === '"' || c === "'") {
      const end = tag.indexOf(c, i + 1);
      i = end === -1 ? tag.length : end + 1;
      continue;
    }
    const name = /^([@#*[(]?[a-zA-Z][\w.:$-]*)/u.exec(tag.slice(i));
    if (name === null || (i > 0 && /[\w"'`-]/u.test(tag[i - 1]))) {
      i += 1;
      continue;
    }
    found.push(name[1]);
    i += name[1].length;
  }
  return found;
}

const { byElement, byAttribute, slots, declarations } = declaredByFold();
const OPENING_TAG = /<([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/gu;

/** Toutes les entrées que fold déclare, tous contrats confondus. */
const EVERY_FOLD_INPUT = new Set(
  [...byElement.values(), ...byAttribute.values()].flatMap((names) => [...names]),
);

/**
 * Ce qu'un élément a le droit de porter — et **jusqu'où la porte a le droit de
 * juger**, ce qui est la vraie difficulté.
 *
 * Deux régimes, parce que la porte ne connaît que fold :
 *
 * - sur un **élément fold** (`<fold-card>`), fold possède la balise : tout
 *   attribut qui n'est ni une de ses entrées, ni un attribut global, ni un
 *   emplacement de projection, est inconnu. Régime strict ;
 * - sur un élément qui porte seulement une **directive fold**
 *   (`<a foldButton routerLink=…>`), la balise appartient à tout le monde. La
 *   porte ne sait rien de `routerLink`, de `appCan` ni de `let-row`, et les
 *   reprocher serait un mensonge. Elle ne retient donc que les noms que fold
 *   déclare AILLEURS : `variant` est une entrée de `fold-badge`, donc écrire
 *   `variant` sur un `foldButton` est une confusion de contrat — ce qui est
 *   exactement la faute d'origine. Régime prudent.
 *
 * ⚠️ Le régime prudent laisse passer un nom que fold n'emploie nulle part
 * (`couleur="rouge"` sur un `foldButton`). C'est assumé : l'alternative serait
 * de lire aussi les entrées de toutes les directives de l'app et d'Angular, et
 * une porte qui crie à tort est désactivée dans la semaine.
 */
function allowedOn(tag, names) {
  const element = byElement.get(tag);
  const directives = names.map((name) => byAttribute.get(name)).filter((set) => set !== undefined);
  if (element === undefined && directives.length === 0) {
    return null;
  }
  // 🔴 Les attributs natifs ne sont dispensés QUE sur une balise native. Posé
  // sur un composant, `inputmode` ou `maxlength` reste sur l'élément hôte et
  // n'atteint jamais le contrôle qu'il enveloppe : il est inerte, exactement
  // comme un nom inventé. C'est la même panne, et elle se dit ici.
  const allowed = new Set([
    ...(element === undefined ? GLOBAL_ATTRIBUTES : []),
    ...ALWAYS_ALLOWED,
    ...slots,
  ]);
  for (const contract of [...(element === undefined ? [] : [element]), ...directives]) {
    for (const input of contract) {
      allowed.add(input);
    }
  }
  // Le nom de la directive elle-même (`foldButton`, `foldSurface`) est l'attribut
  // qui la déclenche : il ne peut pas être une entrée inconnue.
  for (const name of names) {
    if (byAttribute.has(name)) {
      allowed.add(name);
    }
  }
  return { allowed, strict: element !== undefined };
}

const found = new Map();

/**
 * Le gabarit d'un fichier, et **rien que lui**.
 *
 * Deux sources de gabarit factice, toutes deux rencontrées sur le dépôt :
 *
 * - un `@example` de JSDoc montre du HTML qui n'est pas compilé (`fold-well.ts`
 *   en porte un, avec un attribut de projection que ce composant définit
 *   lui-même) ;
 * - un commentaire HTML garde parfois une ancienne écriture.
 *
 * Les deux sont remplacés par des espaces plutôt que supprimés, pour que les
 * numéros de ligne restent ceux du fichier.
 */
function templateOf(rel, text) {
  const blanked = (source) => source.replace(/[^\n]/gu, " ");
  const withoutComments = text.replace(/<!--[\s\S]*?-->/gu, blanked);
  if (!rel.endsWith(".ts")) {
    return withoutComments;
  }
  // Seuls les `template:` d'un décorateur sont compilés. Le reste du fichier —
  // JSDoc compris — ne rend rien.
  let kept = blanked(withoutComments);
  for (const match of withoutComments.matchAll(/\btemplate:\s*`/gu)) {
    const from = match.index + match[0].length;
    const end = withoutComments.indexOf("`", from);
    if (end === -1) {
      continue;
    }
    kept = kept.slice(0, from) + withoutComments.slice(from, end) + kept.slice(end);
  }
  return kept;
}

for (const rel of trackedTemplates()) {
  const raw = readFileSync(join(ROOT, rel), "utf8");
  if (!raw.includes("fold")) {
    continue;
  }
  const text = templateOf(rel, raw);
  for (const match of text.matchAll(OPENING_TAG)) {
    const [, tag, rawAttributes] = match;
    const names = attributesOf(rawAttributes);
    const contract = allowedOn(tag, names);
    if (contract === null) {
      continue;
    }
    const { allowed, strict } = contract;
    for (const name of names) {
      // Liaisons, références, structurelles, blocs : Angular les vérifie déjà.
      if (/^[@#*[(]/u.test(name) || name.includes(".") || name.startsWith("attr")) {
        continue;
      }
      // `let-row` déclare une variable de gabarit, pas un attribut ; et
      // `ngProjectAs` s'adresse au compilateur.
      if (name.startsWith("let-") || name === "ngProjectAs") {
        continue;
      }
      if (name.startsWith("aria-") || name.startsWith("data-")) {
        continue;
      }
      if (allowed.has(name)) {
        continue;
      }
      // Régime prudent : hors d'un élément fold, seuls les noms que fold emploie
      // ailleurs sont une confusion de contrat. Le reste appartient à une
      // directive que la porte ne connaît pas — et un attribut natif ou une
      // directive d'Angular garde son sens sur une balise native.
      if (
        !strict &&
        (!EVERY_FOLD_INPUT.has(name) ||
          NATIVE_BUT_CLAIMED.has(name) ||
          ANGULAR_DIRECTIVES.has(name))
      ) {
        continue;
      }
      const line = text.slice(0, match.index).split("\n").length;
      found.set(rel, [...(found.get(rel) ?? []), { line, tag, name }]);
    }
  }
}

const failures = [];

for (const [rel, hits] of found) {
  const expected = DEBT.get(rel) ?? 0;
  if (hits.length > expected) {
    failures.push({ rel, hits, expected });
  }
}
for (const [rel, expected] of DEBT) {
  const hits = found.get(rel) ?? [];
  if (hits.length < expected) {
    failures.push({ rel, hits, expected, drained: true });
  }
}

if (failures.length > 0) {
  console.error("\n✖ Attributs inconnus sur un composant fold :\n");
  for (const { rel, hits, expected, drained } of failures) {
    if (drained === true) {
      console.error(
        `  ${rel}\n      → ${expected} attendu(s) par la liste, ${hits.length} trouvé(s).\n` +
          "        Retirer la ligne de DEBT : une dette payée qui reste inscrite ment.\n",
      );
      continue;
    }
    console.error(`  ${rel} — ${hits.length} trouvé(s), ${expected} toléré(s)`);
    for (const { line, tag, name } of hits) {
      console.error(`      ${rel}:${line}  <${tag}> ${name}=`);
    }
    console.error("");
  }
  console.error(
    "Un attribut statique inconnu est du HTML valide : Angular l'ignore en\n" +
      "silence, et le composant rend son défaut. Rien d'autre ne peut le dire.\n" +
      "Les entrées réelles sont dans les types publiés de fold-ng.\n",
  );
  process.exit(1);
}

const debt = [...DEBT.values()].reduce((total, count) => total + count, 0);
console.log(
  `✓ fold-unknown-attributes : ${declarations} déclarations lues chez fold, ` +
    `${debt} attribut(s) inconnu(s) dans ${DEBT.size} fichier(s) — compté, en baisse seulement.`,
);
