/**
 * **Les sociétés suspendues et terminées existantes** — ce que le lot P0 du
 * plan `documentation/comptes-client/plan-pros-en-cours-d-inscription.md`
 * change chez elles, sorti pour que Hugo tranche société par société (Q9).
 *
 * Depuis P0, une société SUSPENDUE est servie au prix public (rayon, devis,
 * passation), carte seule, tant que le staff n'a pas choisi son tarif (P1) ;
 * une société TERMINÉE ne commande plus à son nom (« Ce compte est clos. »).
 * Avant, les deux étaient tarifées pro.
 *
 * ```bash
 * DATABASE_LFD_URL=postgresql://… node dev-toolbox/audits/suspended-companies.mjs
 * ```
 *
 * 🔴 LECTURE SEULE : la transaction est `READ ONLY` (Postgres refuserait une
 * écriture), et aucune donnée personnelle n'est lue — ni contact, ni e-mail.
 * L'URL vient de l'environnement, jamais de la ligne de commande : un argument
 * se lit dans `ps` et dans l'historique du shell.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(`${root}apps/lfd-api/package.json`);
const { Client } = require("pg");

const url = process.env.DATABASE_LFD_URL;
if (url === undefined || url === "") {
  console.error("DATABASE_LFD_URL manque : passez l’URL de la base par l’environnement.");
  process.exit(2);
}

/** Ce que P0 leur fait, par statut. */
const EFFECT = {
  suspended: "servie au prix PUBLIC, carte seule — tarif à choisir (P1)",
  terminated: "commande au nom de la société REFUSÉE",
};

const client = new Client({ connectionString: url });
await client.connect();
try {
  await client.query("BEGIN READ ONLY");
  const { rows } = await client.query(
    `SELECT c.id, c.reference, c.raison_sociale, c.enseigne, c.status::text AS status,
            c.suspension_cause::text AS suspension_cause,
            (SELECT max(o.created_at) FROM public.orders o WHERE o.company_id = c.id) AS last_order_at
       FROM public.companies c
      WHERE c.status IN ('suspended', 'terminated')
      ORDER BY c.status, c.raison_sociale`,
  );
  await client.query("ROLLBACK");
  console.log(`${rows.length} société(s) suspendue(s) ou terminée(s).`);
  for (const row of rows) {
    const name =
      row.enseigne === "" ? row.raison_sociale : `${row.enseigne} (${row.raison_sociale})`;
    const cause = row.suspension_cause === null ? "" : ` · cause ${row.suspension_cause}`;
    const last =
      row.last_order_at === null
        ? "aucune commande"
        : `dernière commande ${row.last_order_at.toISOString()}`;
    console.log(
      `${row.status} · ${row.reference} · ${name} (${row.id})${cause} · ${last} · ${EFFECT[row.status]}`,
    );
  }
} finally {
  await client.end();
}
