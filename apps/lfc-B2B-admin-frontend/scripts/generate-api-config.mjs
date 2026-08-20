// Génère `src/app/api/api.env.generated.ts` (git-ignored) depuis l'environnement,
// AVANT `ng serve` / `ng build`. Source : `.env` en dev local, variables CI/Cloudflare
// en déployé (`process.env` gagne). Valeur PUBLIQUE (l'URL d'API n'est pas un secret).
//
// Ne concerne QUE le build **prod** : en `development`, angular.json substitue
// `api-config.ts` par `api-config.dev.ts` (gateway-aware, @lfd/endpoints) — ce fichier
// généré n'y est pas compilé. En prod (`production`/`cloudflare`), `api-config.ts` lit
// cette valeur. Vide + warning si la variable n'est pas posée (le CI doit la fournir).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const envPath = resolve(appRoot, '.env');
const outPath = resolve(appRoot, 'src/app/api/api.env.generated.ts');

function parseDotenv(text) {
  const out = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq === -1) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (quoted) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const fileVars = existsSync(envPath)
  ? parseDotenv(readFileSync(envPath, 'utf8'))
  : {};

const apiBaseUrl = (
  process.env['B2B_ADMIN_API_BASE_URL'] ??
  fileVars['B2B_ADMIN_API_BASE_URL'] ??
  ''
).trim();

if (apiBaseUrl === '') {
  console.warn(
    '[api-config] B2B_ADMIN_API_BASE_URL manquante — valeur vide écrite ' +
      '(OK en dev : le build development utilise api-config.dev.ts ; ' +
      'À RENSEIGNER pour un build prod/cloudflare).',
  );
}

const banner =
  '// ⚠️ GÉNÉRÉ — ne pas éditer, ne pas committer (git-ignored).\n' +
  '// Produit par scripts/generate-api-config.mjs depuis l’environnement\n' +
  '// (.env en dev local, variables CI/Cloudflare en déployé).\n\n';

// Vide = Sentry n'est pas branché et l'app démarre sans lui. Publique par
// nature (elle voyage dans le bundle) : ce n'est pas un secret, c'est une
// adresse de dépôt. Facultative, donc PAS dans l'avertissement ci-dessus — une
// alerte qui sonne à chaque build de dev pour un choix délibéré apprend à
// ignorer les alertes.
const sentryDsn = (process.env['SENTRY_DSN'] ?? fileVars['SENTRY_DSN'] ?? '').trim();

const body =
  `export const B2B_API_BASE_VALUE = ${JSON.stringify(apiBaseUrl)};\n` +
  `export const SENTRY_DSN_VALUE = ${JSON.stringify(sentryDsn)};\n`;

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, banner + body);
console.log(`[api-config] écrit ${outPath} (${apiBaseUrl || '(vide)'})`);
