/**
 * Construit EN MÉMOIRE le **manifeste des textes des e-mails** (plan
 * `documentation/contenu-ecommerce/plan-textes-des-e-mails.md`, E1).
 *
 * Partagé par le générateur (`mail-copy-digest.mjs`, qui écrit) et par la
 * porte (`gates/mail-copy-digest.mjs`, qui compare) : les deux ne peuvent pas
 * diverger sur ce que « le manifeste à jour » veut dire.
 *
 * Pour chaque e-mail du registre, chaque texte : son chemin, le texte
 * français par défaut, les variables qu'il PEUT porter (déclarées dans
 * `mail-copy.variables.ts`) et celles qu'il DOIT porter — les variables du
 * texte français par défaut. C'est ce qu'E2 relira pour refuser un texte
 * réécrit qui en perd une ou en invente une (C5).
 *
 * Aplatissement : un objet donne `parent.enfant`. Une valeur qui n'est ni une
 * chaîne ni un objet n'est pas un texte : elle fait échouer, jamais au silence.
 */
import { importTs } from "../shop-copy/load-ts.mjs";

export const COPY_DIR = "apps/lfd-api/src/platform/mailer/copy";
export const MANIFEST_PATH = `${COPY_DIR}/mail-copy-manifest.json`;
export const REGENERATE = "pnpm mail-copy:digest";

const VARIABLE = /\{(\w+)\}/g;

function flatten(value, path, out) {
  if (typeof value === "string") {
    out.push([path, value]);
    return;
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} n'est pas un texte : le manifeste ne sait pas le recenser.`);
  }
  for (const [key, child] of Object.entries(value)) {
    flatten(child, path === "" ? key : `${path}.${key}`, out);
  }
}

function variablesOf(text) {
  return [...new Set([...text.matchAll(VARIABLE)].map((match) => match[1]))];
}

/** Le manifeste, et son texte JSON tel qu'il est commité. */
export async function buildMailCopyManifest() {
  const { MAIL_COPY } = await importTs(`${COPY_DIR}/mail-copy.ts`);
  const { MAIL_COPY_VARIABLES } = await importTs(`${COPY_DIR}/mail-copy.variables.ts`);
  const mails = {};
  let count = 0;
  for (const [mail, section] of Object.entries(MAIL_COPY.fr)) {
    const declared = MAIL_COPY_VARIABLES[mail] ?? {};
    const texts = [];
    flatten(section, "", texts);
    mails[mail] = Object.fromEntries(
      texts.map(([key, fr]) => {
        count += 1;
        return [key, { variables: declared[key] ?? [], required: variablesOf(fr), fr }];
      }),
    );
  }
  const manifest = {
    $comment: `Généré par \`${REGENERATE}\` depuis ${COPY_DIR}/ — ne pas éditer à la main.`,
    mails,
  };
  return { manifest, count, json: `${JSON.stringify(manifest, null, 2)}\n` };
}
