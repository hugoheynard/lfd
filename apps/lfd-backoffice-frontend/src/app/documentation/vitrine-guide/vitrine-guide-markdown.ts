import {
  AUTH_POINTS,
  type DocRow,
  ERROR_TABLE,
  FIELD_HEADERS,
  GUIDE_INTRO,
  GUIDE_RECEIVED,
  GUIDE_SECTIONS,
  type GuideSection,
  NOTIFICATION_HEADER_POINTS,
  NOTIFICATION_TABLE_CAPTIONS,
  NOTIFICATION_TOPICS,
  PRICE_WARNING,
  PRINCIPLE_POINTS,
  READ_POINTS,
  ROUTE_TABLE,
  SAMPLE_LABELS,
  SCHEMA_POINTS,
  SIGNATURE_INTRO,
  SIGNATURE_STEPS,
  VITRINE_GUIDE_TITLE,
  VITRINE_XML_AVAILABLE,
  XML_POINTS,
  XML_SOON,
} from './vitrine-guide-content';
import {
  SCHEMA_BOXES,
  SCHEMA_CONTAINS,
  SCHEMA_LEGEND,
  SCHEMA_REFERENCES,
  type SchemaBoxKey,
  SEQUENCE_ACTORS,
  SEQUENCE_FAILURE,
  SEQUENCE_MESSAGES,
  SEQUENCE_SWEEP,
  type SequenceMessage,
} from './vitrine-guide-diagrams';
import {
  NODE_VERIFY,
  PHP_VERIFY,
  SAMPLE_ERROR,
  SAMPLE_ITEM_JSON,
  SAMPLE_ITEM_XML,
  SAMPLE_NOTIFICATION_JSON,
  SAMPLE_READ,
  SAMPLE_REQUEST_HEADERS,
} from './vitrine-guide-samples';
import {
  VITRINE_ELEMENT_KEY_FIELDS,
  VITRINE_ENTITIES,
  VITRINE_NOTIFICATION_FIELDS,
  type VitrineField,
} from './vitrine-guide-schema';

/**
 * **Le guide de l'agence en Markdown**, pour l'envoyer en fichier plutôt
 * qu'en PDF. Il est GÉNÉRÉ depuis les sources de la page — prose
 * (`vitrine-guide-content.ts`), tableaux (`vitrine-guide-schema.ts`),
 * exemples (`vitrine-guide-samples.ts`), schémas (`vitrine-guide-diagrams.ts`) :
 * un texte recopié à part dirait l'ancien contrat au premier changement.
 *
 * Les six sections portent les titres de la page, dans le même ordre ; les
 * entités du schéma y sont des sous-titres de la section 5, comme leurs cartes
 * suivent la sienne à l'écran.
 */
export function buildVitrineGuideMarkdown(xmlAvailable: boolean = VITRINE_XML_AVAILABLE): string {
  return [
    `# ${VITRINE_GUIDE_TITLE}`,
    GUIDE_INTRO,
    `> **${GUIDE_RECEIVED.lead}** ${GUIDE_RECEIVED.body}`,
    ...principleSection(),
    ...authSection(),
    ...notificationSection(),
    ...readsSection(),
    ...schemaSection(),
    ...xmlSection(xmlAvailable),
  ]
    .join('\n\n')
    .concat('\n');
}

function principleSection(): readonly string[] {
  return [heading(GUIDE_SECTIONS.principle), mermaidSequence(), bullets(PRINCIPLE_POINTS)];
}

function authSection(): readonly string[] {
  return [
    heading(GUIDE_SECTIONS.auth),
    bullets(AUTH_POINTS),
    SIGNATURE_INTRO,
    SIGNATURE_STEPS.map((step, index) => `${index + 1}. ${step}`).join('\n'),
    sample(SAMPLE_LABELS.node, 'js', NODE_VERIFY),
    sample(SAMPLE_LABELS.php, 'php', PHP_VERIFY),
  ];
}

function notificationSection(): readonly string[] {
  return [
    heading(GUIDE_SECTIONS.notification),
    sample(SAMPLE_LABELS.headers, 'http', SAMPLE_REQUEST_HEADERS),
    bullets(NOTIFICATION_HEADER_POINTS),
    sample(SAMPLE_LABELS.body, 'json', SAMPLE_NOTIFICATION_JSON),
    fieldTable(NOTIFICATION_TABLE_CAPTIONS.body, VITRINE_NOTIFICATION_FIELDS),
    fieldTable(NOTIFICATION_TABLE_CAPTIONS.keys, VITRINE_ELEMENT_KEY_FIELDS),
    ...NOTIFICATION_TOPICS.flatMap((topic) => [`### ${topic.title}`, bullets(topic.points)]),
  ];
}

function readsSection(): readonly string[] {
  return [
    heading(GUIDE_SECTIONS.reads),
    sample(SAMPLE_LABELS.request, 'http', SAMPLE_READ),
    docTable(ROUTE_TABLE.caption, ROUTE_TABLE.headers, ROUTE_TABLE.rows),
    bullets(READ_POINTS),
    sample(SAMPLE_LABELS.error, 'json', SAMPLE_ERROR),
    docTable(ERROR_TABLE.caption, ERROR_TABLE.headers, ERROR_TABLE.rows),
  ];
}

function schemaSection(): readonly string[] {
  return [
    heading(GUIDE_SECTIONS.schema),
    mermaidRelations(),
    `> ⚠️ **${PRICE_WARNING.lead}** ${PRICE_WARNING.body}`,
    bullets(SCHEMA_POINTS),
    sample(SAMPLE_LABELS.itemJson, 'json', SAMPLE_ITEM_JSON),
    ...VITRINE_ENTITIES.flatMap((entity) => [
      `### ${entity.title}`,
      `*${entity.subtitle}*`,
      table(FIELD_HEADERS, entity.fields.map(fieldCells)),
    ]),
  ];
}

function xmlSection(xmlAvailable: boolean): readonly string[] {
  return [
    `${heading(GUIDE_SECTIONS.xml)}${xmlAvailable ? '' : ` — ${XML_SOON.badge}`}`,
    ...(xmlAvailable ? [] : [`> ⚠️ ${XML_SOON.body}`]),
    bullets(XML_POINTS),
    sample(SAMPLE_LABELS.json, 'json', SAMPLE_ITEM_JSON),
    sample(SAMPLE_LABELS.xml, 'xml', SAMPLE_ITEM_XML),
  ];
}

function heading(section: GuideSection): string {
  return `## ${section.title}\n\n*${section.subtitle}*`;
}

function bullets(points: readonly string[]): string {
  return points.map((point) => `- ${point}`).join('\n');
}

/** La clôture s'allonge si le code contient lui-même trois accents graves. */
function sample(label: string, language: string, code: string): string {
  const fence = code.includes('```') ? '````' : '```';
  return `**${label}**\n\n${fence}${language}\n${code.trimEnd()}\n${fence}`;
}

function fieldCells(field: VitrineField): readonly string[] {
  return [`\`${field.field}\``, field.type, field.presence, field.description];
}

function fieldTable(caption: string, fields: readonly VitrineField[]): string {
  return `**${caption}**\n\n${table(FIELD_HEADERS, fields.map(fieldCells))}`;
}

function docTable(caption: string, headers: readonly string[], rows: readonly DocRow[]): string {
  const cells = rows.map((row) => [`\`${row.a}\``, row.b, row.c]);
  return `**${caption}**\n\n${table(headers, cells)}`;
}

/** Un tableau GFM : chaque `|` d'une cellule est échappé, chaque saut de ligne aplati. */
export function table(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const line = (cells: readonly string[]): string => `| ${cells.map(escapeCell).join(' | ')} |`;
  return [line(headers), line(headers.map(() => '---')), ...rows.map(line)].join('\n');
}

export function escapeCell(text: string): string {
  return text.replaceAll('\\', '\\\\').replaceAll('|', '\\|').replaceAll(/\r?\n/g, ' ');
}

/** `;` sépare deux instructions Mermaid, `#` ouvre une entité : on les écrit en entités. */
function mermaidText(text: string): string {
  return text.replaceAll('#', '#35;').replaceAll(';', '#59;');
}

function mermaidSequence(): string {
  const id = { server: 'LF', site: 'S' } as const;
  const message = (m: SequenceMessage): string => {
    const to = m.from === 'server' ? id.site : id.server;
    return `  ${id[m.from]}${m.reply ? '-->>' : '->>'}${to}: ${mermaidText(m.label)}`;
  };
  const notify: SequenceMessage = SEQUENCE_MESSAGES.notify;
  return [
    '```mermaid',
    'sequenceDiagram',
    `  participant ${id.server} as ${mermaidText(SEQUENCE_ACTORS.server)}`,
    `  participant ${id.site} as ${mermaidText(SEQUENCE_ACTORS.site)}`,
    `  Note over ${id.server}: ${mermaidText(SEQUENCE_SWEEP)}`,
    message(notify),
    ...(notify.sub === undefined
      ? []
      : [`  Note over ${id.server},${id.site}: ${mermaidText(notify.sub)}`]),
    message(SEQUENCE_MESSAGES.ack),
    message(SEQUENCE_MESSAGES.read),
    message(SEQUENCE_MESSAGES.served),
    `  opt ${mermaidText(SEQUENCE_FAILURE.title)}`,
    ...SEQUENCE_FAILURE.lines.map(
      (line) => `    Note over ${id.server},${id.site}: ${mermaidText(line)}`,
    ),
    '  end',
    '```',
  ].join('\n');
}

function mermaidRelations(): string {
  const node = (key: SchemaBoxKey): string => {
    const box = SCHEMA_BOXES[key];
    const label = [box.title, ...box.lines].map(mermaidLabel).join('<br/>');
    return `  ${key}["${label}"]`;
  };
  const keys = Object.keys(SCHEMA_BOXES) as SchemaBoxKey[];
  return [
    '```mermaid',
    'flowchart TB',
    ...keys.map(node),
    ...SCHEMA_CONTAINS.map(([from, to]) => `  ${from} --> ${to}`),
    ...Object.values(SCHEMA_REFERENCES).map(
      (ref) => `  ${ref.from} -.->|"${mermaidLabel(ref.label)}"| ${ref.to}`,
    ),
    '```',
    `*${SCHEMA_LEGEND}*`,
  ].join('\n');
}

/** Dans un libellé entre guillemets, seul `"` casserait le nœud. */
function mermaidLabel(text: string): string {
  return mermaidText(text).replaceAll('"', '#quot;');
}
