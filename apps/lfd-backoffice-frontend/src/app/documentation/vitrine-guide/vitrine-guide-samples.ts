import type { VitrineItemView, VitrineNotification } from '@lfd/contracts';

import { toVitrineXml } from './vitrine-xml';

/**
 * **Les exemples du guide de l'agence**, typés contre le contrat : un champ
 * renommé dans `@lfd/contracts` fait échouer la compilation ici, au lieu de
 * laisser le guide montrer un champ qui n'existe plus.
 *
 * Les VALEURS sont inventées (un croissant, une promotion) ; les formes ne le
 * sont pas. Le code de vérification reproduit `verifyVitrineSignature`
 * (`apps/lfd-api/src/b2b/vitrine/domain/services/vitrine-signature.ts`, relu
 * le 2026-10-18) : `<t>.<corps brut>`, HMAC-SHA256 en hexadécimal, 300 s.
 */

/** Un article, avec une promotion en cours (d'où le prix à barrer). */
export const SAMPLE_ITEM: VitrineItemView = {
  sku: 'VIE-001',
  name: 'Croissant au beurre',
  note: 'Beurre AOP Charentes-Poitou',
  image: {
    url: 'https://…/croissant.jpg',
    alt: 'Croissant doré sur une planche',
    width: 1600,
    height: 1200,
    focal: { x: 0.5, y: 0.4 },
  },
  thumbnail: null,
  unitPriceMillicents: 120000,
  unitPriceTtcCents: 127,
  catalogPriceMillicents: 135000,
  vatRatePercent: 5.5,
  shelfId: 'cat_viennoiseries',
  isFeatured: true,
  audience: 'both',
};

export const SAMPLE_ITEM_JSON = JSON.stringify(SAMPLE_ITEM, null, 2);
export const SAMPLE_ITEM_XML = toVitrineXml('item', SAMPLE_ITEM);

/** Une notification : un article changé, un retiré, un texte changé. */
export const SAMPLE_NOTIFICATION: VitrineNotification = {
  subscriber: '01JA…',
  sequence: 42,
  at: '2026-10-18T09:05:00.000Z',
  changed: { items: ['VIE-001'], operations: [], shelves: [], texts: ['product.bestSeller'] },
  removed: { items: ['PAI-007'], operations: [], shelves: [], texts: [] },
};

export const SAMPLE_NOTIFICATION_JSON = JSON.stringify(SAMPLE_NOTIFICATION, null, 2);

export const SAMPLE_REQUEST_HEADERS = `POST /votre-adresse HTTP/1.1
content-type: application/json
vitrine-signature: t=1792314300,v1=5f2b…c9e1
vitrine-delivery: 01JA…`;

export const SAMPLE_READ = `GET /vitrine/catalogue?lang=en HTTP/1.1
X-Vitrine-Key: <votre clé de lecture>`;

export const SAMPLE_ERROR = `{
  "code": "vitrine.read_key.refused",
  "message": "Clé de lecture absente ou inconnue (en-tête X-Vitrine-Key). …",
  "requestId": "…"
}`;

export const NODE_VERIFY = `import { createHmac, timingSafeEqual } from 'node:crypto';

const TOLERANCE_SECONDS = 300;

/**
 * rawBody : le corps EXACT reçu, en chaîne — jamais un JSON re-sérialisé.
 * header  : la valeur de l'en-tête Vitrine-Signature.
 */
export function isFromLaFolie(rawBody, header, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  const fields = new Map(
    (header ?? '').split(',').map((part) => {
      const [name = '', ...value] = part.trim().split('=');
      return [name, value.join('=')];
    }),
  );
  const t = Number.parseInt(fields.get('t') ?? '', 10);
  const signature = fields.get('v1');
  if (!Number.isFinite(t) || !signature) return false;
  if (Math.abs(nowSeconds - t) > TOLERANCE_SECONDS) return false;

  const expected = createHmac('sha256', secret).update(\`\${t}.\${rawBody}\`, 'utf8').digest('hex');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Express : lire le corps BRUT sur cette route.
app.post('/webhooks/la-folie', express.raw({ type: 'application/json' }), (req, res) => {
  const raw = req.body.toString('utf8');
  if (!isFromLaFolie(raw, req.get('vitrine-signature'), VITRINE_SIGNING_SECRET /* depuis votre configuration */)) {
    return res.sendStatus(401);
  }
  const notification = JSON.parse(raw);
  res.sendStatus(204);                 // répondre vite (moins de 5 s)…
  queueRefresh(req.get('vitrine-delivery'), notification); // …et relire ensuite
});`;

export const PHP_VERIFY = `<?php
const VITRINE_TOLERANCE_SECONDS = 300;

function vitrine_is_from_la_folie(string $rawBody, string $header, string $secret, ?int $now = null): bool
{
    $now ??= time();
    $fields = [];
    foreach (explode(',', $header) as $part) {
        $pair = explode('=', trim($part), 2);
        if (count($pair) === 2) {
            $fields[$pair[0]] = $pair[1];
        }
    }
    if (!isset($fields['t'], $fields['v1']) || !ctype_digit($fields['t'])) {
        return false;
    }
    if (abs($now - (int) $fields['t']) > VITRINE_TOLERANCE_SECONDS) {
        return false;
    }
    $expected = hash_hmac('sha256', $fields['t'] . '.' . $rawBody, $secret);
    return hash_equals($expected, $fields['v1']);
}

$raw = file_get_contents('php://input');          // le corps BRUT
$header = $_SERVER['HTTP_VITRINE_SIGNATURE'] ?? '';
if (!vitrine_is_from_la_folie($raw, $header, $vitrineSigningSecret /* depuis votre configuration */)) {
    http_response_code(401);
    exit;
}
$delivery = $_SERVER['HTTP_VITRINE_DELIVERY'] ?? '';
$notification = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
http_response_code(204);                           // répondre vite (moins de 5 s)…
// …puis relire les éléments nommés dans $notification['changed'].`;
