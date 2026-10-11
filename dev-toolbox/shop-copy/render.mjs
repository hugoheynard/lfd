/**
 * Le rendu Markdown du recueil des textes de la boutique. Pur : des espaces
 * en entrée, une chaîne en sortie. Tables non alignées : le fichier est dans
 * `.prettierignore`, et l'alignement le triplerait.
 */

const GENERATOR = "dev-toolbox/shop-copy-digest.mjs";

function cell(text) {
  if (text === null) return "∅";
  if (text === "") return "_(vide)_";
  return text.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

function anchor(space) {
  return `espace-${space.toLowerCase()}`;
}

function summaryRow(s) {
  const extra = s.unrecorded.length > 0 ? ` (+ ${s.unrecorded.length} non recensé)` : "";
  return `| [${cell(s.title)}](#${anchor(s.space)}) | \`${s.space}\` | ${s.entries.length}${extra} |`;
}

function spaceSection(s) {
  const lines = [
    `<a id="${anchor(s.space)}"></a>`,
    "",
    `### ${s.title} — \`${s.space}\``,
    "",
    `Source : \`${s.source}\` · ${s.entries.length} textes.`,
    "",
    "| Clé | FR | EN | IT | Variables |",
    "| --- | --- | --- | --- | --- |",
    ...s.entries.map(
      (e) =>
        `| \`${e.key}\` | ${cell(e.fr)} | ${cell(e.en)} | ${cell(e.it)} | ${e.variables.map((v) => `\`{${v}}\``).join(" ")} |`,
    ),
  ];
  return lines.join("\n");
}

function unrecordedSection(spaces) {
  const rows = spaces.flatMap((s) =>
    s.unrecorded.map((u) => `| \`${u.key}\` | ${u.kind} | \`${s.source}\` |`),
  );
  if (rows.length === 0)
    return "## Non recensé\n\nRien : toute valeur des dictionnaires est une chaîne ou un tableau de chaînes.";
  return [
    "## Non recensé",
    "",
    "Ces valeurs ne sont pas des chaînes : une fonction compose son texte à l'exécution, le recueil ne peut pas le recopier. Elles se reformulent dans leur fichier source.",
    "",
    "| Clé | Nature | Source |",
    "| --- | --- | --- |",
    ...rows,
  ].join("\n");
}

/** Le recueil complet, avant Prettier. */
export function renderDigest(spaces) {
  const journey = spaces.filter((s) => s.journey);
  const others = spaces.filter((s) => !s.journey);
  const total = spaces.reduce((n, s) => n + s.entries.length, 0);
  const missing = spaces.flatMap((s) =>
    s.entries.filter((e) => e.fr === null || e.en === null || e.it === null),
  );
  return [
    "# Les textes de la boutique",
    "",
    `> **Généré** par \`${GENERATOR}\` depuis les dictionnaires de \`apps/lfc-ecommerce-frontend/src/app/client/copy/\`. **Ne pas éditer à la main** : régénérer par \`pnpm copy:digest\`. La porte \`pnpm lint:shop-copy-digest\` échoue si ce fichier ne correspond plus au code.`,
    ">",
    "> La base de la reformulation (plan [`plan-textes-de-la-boutique.md`](plan-textes-de-la-boutique.md), §7 bis). Il dit le texte **du code**. `∅` : la clé manque dans cette langue ; `_(vide)_` : elle y vaut la chaîne vide.",
    "",
    `## Sommaire — ${total} textes`,
    "",
    `Clés présentes dans une langue et absentes d'une autre : ${missing.length}.`,
    "",
    "| Espace | Clé | Textes |",
    "| --- | --- | --- |",
    "| **Parcours de commande** | | |",
    ...journey.map(summaryRow),
    "| **Le reste de la boutique** | | |",
    ...others.map(summaryRow),
    `| **Total** | | **${total}** |`,
    "",
    "## Le parcours de commande",
    "",
    ...journey.map((s) => `${spaceSection(s)}\n`),
    "## Le reste de la boutique",
    "",
    ...others.map((s) => `${spaceSection(s)}\n`),
    unrecordedSection(spaces),
    "",
  ].join("\n");
}
