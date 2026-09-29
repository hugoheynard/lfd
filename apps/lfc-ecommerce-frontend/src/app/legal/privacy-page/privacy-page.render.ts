/**
 * **La politique de confidentialité en HTML complet**, pour qui ne lit pas le
 * JavaScript — le robot de Meta d'abord (plan
 * `documentation/legal/plan-page-confidentialite.md`, §3 option A).
 *
 * Fonction PURE : elle reçoit la réponse déjà lue de
 * `GET /content/legal/privacy` et rend un statut et une page. La Pages Function
 * (`functions/confidentialite.ts`) n'est qu'un adaptateur autour d'elle.
 *
 * ⚠️ Ce fichier vit sous `src/` pour être éprouvé par `ng test`, mais aucune
 * page Angular ne l'importe : il n'entre donc pas dans le bundle de la boutique.
 * Il n'importe rien, et surtout pas `@lfd/contracts` en valeur — ce serait zod.
 *
 * **Rien de ce qui vient du back-office n'est interprété** : titre, titres de
 * paragraphe, corps et identifiants sont échappés. Le corps garde ses retours à
 * la ligne par `white-space: pre-line`, pas par un `<br>` fabriqué.
 */

/** Ce que la Function renvoie : un statut et une page, toujours lisible. */
export interface PrivacyPage {
  readonly status: 200 | 503;
  readonly html: string;
}

/** Ce que la page lit du document — le sous-ensemble français de `LegalDocumentView`. */
interface PrivacyParagraph {
  readonly id: string;
  readonly title: string;
  readonly body: string;
}

interface PrivacyDocument {
  readonly title: string;
  readonly paragraphs: readonly PrivacyParagraph[];
  readonly updatedAt: Date;
}

const PARIS_TIME_ZONE = 'Europe/Paris';

const UNAVAILABLE_TITLE = 'Politique de confidentialité momentanément indisponible';

const UNAVAILABLE_MESSAGE =
  'La politique de confidentialité ne peut pas être affichée pour le moment. ' +
  'Réessayez dans quelques minutes ; si le problème persiste, écrivez-nous.';

const STYLE =
  'body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;' +
  'line-height:1.6;color:#1f1f1f;background:#fff}' +
  'main{max-width:42rem;margin:0 auto;padding:1.5rem 1rem 3rem}' +
  'h1{font-size:1.6rem;line-height:1.25;margin:0 0 .5rem}' +
  'h2{font-size:1.15rem;margin:2rem 0 .5rem}' +
  'p{margin:0}.body{white-space:pre-line}.updated{color:#5c5c5c;font-size:.9rem}';

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Échappe pour un contenu de balise ET une valeur d'attribut entre guillemets. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character);
}

/** « 1 avril 2026 » — la date du jour à Paris, pas celle d'UTC. */
export function formatParisDate(instant: Date): string {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: PARIS_TIME_ZONE }).format(
    instant,
  );
}

/**
 * Rend la page à partir de la réponse lue de l'API.
 *
 * Un document qu'on ne sait pas lire, ou qui n'a encore aucun paragraphe, rend
 * **503** : une politique vide servie en 200 serait prise pour la politique.
 */
export function renderPrivacyPage(payload: unknown): PrivacyPage {
  const document = readPrivacyDocument(payload);
  if (document === undefined || document.paragraphs.length === 0) {
    return privacyPageUnavailable();
  }
  const sections = document.paragraphs.map(
    (paragraph) =>
      `<section><h2 id="${escapeHtml(paragraph.id)}">${escapeHtml(paragraph.title)}</h2>` +
      `<p class="body">${escapeHtml(paragraph.body)}</p></section>`,
  );
  const main =
    `<h1>${escapeHtml(document.title)}</h1>` +
    `<p class="updated">Dernière mise à jour : ${escapeHtml(formatParisDate(document.updatedAt))}</p>` +
    sections.join('');
  return { status: 200, html: page(document.title, main) };
}

/** La page de l'API injoignable ou en échec : 503, et une phrase qu'on comprend. */
export function privacyPageUnavailable(): PrivacyPage {
  return {
    status: 503,
    html: page(UNAVAILABLE_TITLE, `<h1>${UNAVAILABLE_TITLE}</h1><p>${UNAVAILABLE_MESSAGE}</p>`),
  };
}

function page(title: string, main: string): string {
  return (
    '<!doctype html><html lang="fr"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    `<title>${escapeHtml(title)}</title><style>${STYLE}</style></head>` +
    `<body><main>${main}</main></body></html>`
  );
}

/**
 * Lit la réponse sans zod. Ne vérifie QUE ce que la page affiche — le reste du
 * contrat n'est pas son affaire, et le resserrer ferait tomber la page pour un
 * champ qu'elle ne lit pas.
 */
function readPrivacyDocument(payload: unknown): PrivacyDocument | undefined {
  if (!isRecord(payload) || !isRecord(payload['content'])) {
    return undefined;
  }
  const content = payload['content'];
  const title = isRecord(content['title']) ? nonEmptyText(content['title']['fr']) : undefined;
  const updatedAt = readInstant(payload['updatedAt']);
  const rawParagraphs = content['paragraphs'];
  if (title === undefined || updatedAt === undefined || !Array.isArray(rawParagraphs)) {
    return undefined;
  }
  const paragraphs: PrivacyParagraph[] = [];
  for (const raw of rawParagraphs) {
    const paragraph = readParagraph(raw);
    if (paragraph === undefined) {
      return undefined;
    }
    paragraphs.push(paragraph);
  }
  return { title, paragraphs, updatedAt };
}

function readParagraph(raw: unknown): PrivacyParagraph | undefined {
  if (!isRecord(raw) || !isRecord(raw['fr'])) {
    return undefined;
  }
  const id = nonEmptyText(raw['id']);
  const title = nonEmptyText(raw['fr']['title']);
  const body = nonEmptyText(raw['fr']['body']);
  if (id === undefined || title === undefined || body === undefined) {
    return undefined;
  }
  return { id, title, body };
}

function readInstant(value: unknown): Date | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const instant = new Date(value);
  return Number.isNaN(instant.getTime()) ? undefined : instant;
}

function nonEmptyText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
