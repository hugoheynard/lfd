/**
 * **Audit des RIB** — la case « civilité ou forme juridique » du titulaire
 * porte-t-elle une forme, et rien d'autre ?
 *
 * Ouvert le 2026-10-12 : la commerciale y tapait « Col Pers SAS » au lieu de
 * « SAS », et le mandat imprimait le nom du titulaire dans la case de la forme.
 * La saisie est désormais une liste fermée, et le serveur refuse à l'ÉCRITURE ;
 * les RIB enregistrés avant la règle restent lisibles, et c'est ce script qui
 * dit lesquels corriger (doc
 * `documentation/comptabilite/mandat/mentions-obligatoires-du-mandat.md` §4).
 *
 * ```bash
 * pnpm turbo run build --only --filter=@lfd/contracts
 * DATABASE_LFD_URL=postgresql://… node dev-toolbox/audits/rib-holder-legal-form.mjs
 * ```
 *
 * 🔴 LECTURE SEULE, et à trois titres : la transaction est `READ ONLY` (Postgres
 * refuserait une écriture), la requête ne lit que quatre colonnes, et **aucune
 * colonne d'IBAN** n'est lue — ni scellée, ni en clair. L'URL vient de
 * l'environnement, jamais de la ligne de commande : un argument se lit dans
 * `ps` et dans l'historique du shell.
 *
 * Elle importe la **liste réelle** (`listedHolderLegalForm` de
 * `@lfd/contracts`, compilée) : une liste recopiée ici mesurerait la copie.
 *
 * Trois motifs, cumulables :
 * - `contient le titulaire` — la forme normalisée (casse, accents, espaces)
 *   contient le titulaire normalisé ; même règle que
 *   `DebtorAccount.assertWritableLegalForm` ;
 * - `hors liste` — ni civilité ni libellé de la liste du RIB ;
 * - `plus de 12` — hors liste et plus de 12 caractères (le serveur la
 *   refuserait au prochain enregistrement).
 *
 * Une forme VIDE n'est pas listée : elle est permise hors interentreprises, et
 * la frappe du mandat B2B la réclame déjà.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(`${root}apps/lfd-api/package.json`);
const { Client } = require("pg");
const { listedHolderLegalForm } = await import(`${root}packages/contracts/dist/index.js`);

/** Borne d'une saisie « Autre » — `WRITTEN_HOLDER_LEGAL_FORM_MAX_LENGTH` côté serveur. */
const OTHER_MAX_LENGTH = 12;

const url = process.env.DATABASE_LFD_URL;
if (url === undefined || url === "") {
  console.error("DATABASE_LFD_URL manque : passez l’URL de la base par l’environnement.");
  process.exit(2);
}

/** Casse, accents et espaces retirés — la normalisation du domaine. */
function comparable(text) {
  return text.normalize("NFD").replace(/\p{M}/gu, "").replace(/\s/gu, "").toLowerCase();
}

function reasonsOf(holder, form) {
  const trimmed = form.trim();
  if (trimmed === "") {
    return [];
  }
  const reasons = [];
  if (comparable(trimmed).includes(comparable(holder))) {
    reasons.push("contient le titulaire");
  }
  if (listedHolderLegalForm(trimmed) === null) {
    reasons.push("hors liste");
    if (trimmed.length > OTHER_MAX_LENGTH) {
      reasons.push(`plus de ${OTHER_MAX_LENGTH}`);
    }
  }
  return reasons;
}

const client = new Client({ connectionString: url });
await client.connect();
try {
  await client.query("BEGIN READ ONLY");
  const { rows } = await client.query(
    `SELECT c.id AS company_id, c.raison_sociale, a.holder, a.holder_legal_form
       FROM public.company_bank_accounts a
       JOIN public.companies c ON c.id = a.company_id
      ORDER BY c.raison_sociale`,
  );
  await client.query("ROLLBACK");
  const suspects = rows
    .map((row) => ({ ...row, reasons: reasonsOf(row.holder, row.holder_legal_form) }))
    .filter((row) => row.reasons.length > 0);
  console.log(`${suspects.length} RIB suspect(s) sur ${rows.length}.`);
  for (const row of suspects) {
    console.log(
      `${row.raison_sociale} (${row.company_id}) · titulaire « ${row.holder} » · forme « ${row.holder_legal_form} » · ${row.reasons.join(", ")}`,
    );
  }
} finally {
  await client.end();
}
