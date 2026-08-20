// Génère `src/app/data/api.env.generated.ts` (git-ignored) depuis l'environnement,
// AVANT `ng serve` / `ng build`. Source : `.env` en dev local, variables CI/Cloudflare
// en déployé (`process.env` gagne). Valeur PUBLIQUE (l'URL d'API n'est pas un secret).
//
// Le PIM front est iframé sous le shell (il reçoit son jeton via SuiteBridge) : sa seule
// config d'environnement est l'URL de son API. Depuis B2c, le référentiel n'a plus de
// backend à lui : ses routes vivent sous le préfixe `/pim` de l'API unique (port 3200).
// En dev on retombe sur cette adresse pour que l'app tourne sans `.env`.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const envPath = resolve(appRoot, '.env');
const outPath = resolve(appRoot, 'src/app/data/api.env.generated.ts');

const DEV_DEFAULT = 'http://localhost:3200/pim';

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

const apiBaseUrl =
  (process.env['PIM_API_BASE_URL'] ?? fileVars['PIM_API_BASE_URL'] ?? '').trim() ||
  DEV_DEFAULT;

const banner =
  '// ⚠️ GÉNÉRÉ — ne pas éditer, ne pas committer (git-ignored).\n' +
  '// Produit par scripts/generate-api-config.mjs depuis l’environnement\n' +
  '// (.env en dev local, variables CI/Cloudflare en déployé).\n\n';

// La collecte des vitals vit à la RACINE de l'API (`/ops/vitals`), pas sous le
// préfixe du référentiel : elle appartient à OPS, pas au PIM. On retire donc le
// `/pim` final — la dérivation est ici, à un seul endroit, plutôt que répétée
// dans le code de l'app où elle passerait pour une bricole.
const opsBaseUrl = apiBaseUrl.replace(/\/pim\/?$/, '');

// Vide = Sentry n'est pas branché et l'app démarre sans lui. Publique par nature
// (elle voyage dans le bundle) : ce n'est pas un secret, c'est une adresse.
const sentryDsn = (process.env['SENTRY_DSN'] ?? fileVars['SENTRY_DSN'] ?? '').trim();

const body =
  `export const API_BASE_URL_VALUE = ${JSON.stringify(apiBaseUrl)};\n` +
  `export const OPS_BASE_URL_VALUE = ${JSON.stringify(opsBaseUrl)};\n` +
  `export const SENTRY_DSN_VALUE = ${JSON.stringify(sentryDsn)};\n`;

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, banner + body);
console.log(`[api-config] écrit ${outPath} (${apiBaseUrl})`);
