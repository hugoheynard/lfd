import { GUIDE_SECTIONS, XML_SOON } from '../vitrine-guide-content';
import { SCHEMA_REFERENCES } from '../vitrine-guide-diagrams';
import { buildVitrineGuideMarkdown, escapeCell, table } from '../vitrine-guide-markdown';
import {
  NODE_VERIFY,
  PHP_VERIFY,
  SAMPLE_ITEM_JSON,
  SAMPLE_ITEM_XML,
} from '../vitrine-guide-samples';
import {
  VITRINE_ELEMENT_KEY_FIELDS,
  VITRINE_ENTITIES,
  VITRINE_NOTIFICATION_FIELDS,
} from '../vitrine-guide-schema';

const markdown = buildVitrineGuideMarkdown(true);

/** Les lignes de tableau, hors blocs de code (un `|` y est légitime). */
function tableLines(md: string): readonly string[] {
  return md
    .split(/^```[\s\S]*?^```/m)
    .flatMap((chunk) => chunk.split('\n'))
    .filter((line) => line.startsWith('| '));
}

/** Les cellules d'une ligne, en coupant sur les seuls `|` non échappés. */
function cells(line: string): readonly string[] {
  return line
    .slice(2, -2)
    .split(/(?<!\\) \| /)
    .map((cell) => cell.trim());
}

describe('buildVitrineGuideMarkdown', () => {
  it('titre les six sections comme la page, dans le même ordre', () => {
    const titles = Object.values(GUIDE_SECTIONS).map((section) => `## ${section.title}`);
    const positions = titles.map((title) => markdown.indexOf(title));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(titles).toHaveLength(6);
  });

  it('a chaque champ de chaque entité, avec sa description', () => {
    const rows = tableLines(markdown);
    const fields = [
      ...VITRINE_ENTITIES.flatMap((entity) => entity.fields),
      ...VITRINE_NOTIFICATION_FIELDS,
      ...VITRINE_ELEMENT_KEY_FIELDS,
    ];
    expect(fields.length).toBeGreaterThan(0);
    for (const field of fields) {
      const expected = [
        `\`${field.field}\``,
        escapeCell(field.type),
        field.presence,
        escapeCell(field.description),
      ];
      expect(rows.some((row) => cells(row).join('\u0000') === expected.join('\u0000'))).toBe(true);
    }
    for (const entity of VITRINE_ENTITIES) {
      expect(markdown).toContain(`### ${entity.title}`);
    }
  });

  it("n'a aucun `|` non échappé dans une cellule : chaque ligne a le nombre de colonnes de son en-tête", () => {
    const rows = tableLines(markdown);
    expect(rows.length).toBeGreaterThan(0);
    const widths = new Set(rows.map((row) => cells(row).length));
    expect([...widths].every((width) => width === 3 || width === 4)).toBe(true);
    // Les types d'union portent des `|` : ils doivent sortir échappés.
    expect(markdown).toContain('"fr" \\| "en" \\| "it"');
  });

  it('porte les exemples dans des blocs de code typés', () => {
    expect(markdown).toContain(`\`\`\`js\n${NODE_VERIFY}\n\`\`\``);
    expect(markdown).toContain(`\`\`\`php\n${PHP_VERIFY}\n\`\`\``);
    expect(markdown).toContain(`\`\`\`json\n${SAMPLE_ITEM_JSON}\n\`\`\``);
    expect(markdown).toContain(`\`\`\`xml\n${SAMPLE_ITEM_XML.trimEnd()}\n\`\`\``);
  });

  it('rend les deux schémas en Mermaid, depuis leurs données', () => {
    expect(markdown).toContain('```mermaid\nsequenceDiagram');
    expect(markdown).toContain('```mermaid\nflowchart TB');
    for (const reference of Object.values(SCHEMA_REFERENCES)) {
      expect(markdown).toContain(`${reference.from} -.->|"${reference.label}"| ${reference.to}`);
    }
    // `;` couperait une instruction Mermaid : il sort en entité.
    const sequence = /```mermaid\nsequenceDiagram[\s\S]*?```/.exec(markdown)?.[0] ?? '';
    expect(sequence).toContain('#59;');
    expect(sequence.replaceAll(/#\w+;/g, '')).not.toContain(';');
  });

  it('suit le drapeau XML', () => {
    expect(markdown).not.toContain(XML_SOON.badge);
    const soon = buildVitrineGuideMarkdown(false);
    expect(soon).toContain(`## ${GUIDE_SECTIONS.xml.title}`);
    expect(soon).toContain(XML_SOON.badge);
  });

  it('échappe barre verticale et barre oblique inverse dans une cellule', () => {
    expect(table(['a'], [['x | y \\ z']])).toBe('| a |\n| --- |\n| x \\| y \\\\ z |');
  });
});
