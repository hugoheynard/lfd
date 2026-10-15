/** Un morceau de texte, surligné ou non. */
export interface TextSegment {
  readonly text: string;
  readonly match: boolean;
}

/**
 * Le texte replié pour comparer — sans accents, en minuscules — et, pour chaque
 * caractère replié, l'index du caractère d'origine. La table est ce qui permet
 * de surligner « Légal » quand on a tapé « legal » : la décomposition change la
 * longueur, on ne peut pas réutiliser les index du texte replié tels quels.
 */
interface Folded {
  readonly text: string;
  readonly origin: readonly number[];
}

function foldChar(char: string): string {
  return char.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function fold(text: string): Folded {
  let folded = '';
  const origin: number[] = [];
  for (let index = 0; index < text.length; index++) {
    for (const piece of foldChar(text.charAt(index))) {
      folded += piece;
      origin.push(index);
    }
  }
  return { text: folded, origin };
}

/** Le terme tel qu'on le compare : espaces en trop retirés, replié. Vide = pas de recherche. */
export function normalizeTerm(term: string): string {
  return fold(term.trim().replace(/\s+/g, ' ')).text;
}

/** Le texte contient-il le terme ? Un terme vide correspond à tout. */
export function matchesTerm(text: string, term: string): boolean {
  const needle = normalizeTerm(term);
  return needle === '' || fold(text).text.includes(needle);
}

/**
 * Le texte découpé autour de **chaque** occurrence du terme, insensible à la
 * casse et aux accents. Les morceaux gardent l'orthographe d'origine : on
 * surligne ce qui est écrit, pas ce qu'on a tapé.
 */
export function highlightSegments(text: string, term: string): readonly TextSegment[] {
  const needle = normalizeTerm(term);
  if (needle === '' || text === '') {
    return text === '' ? [] : [{ text, match: false }];
  }
  const folded = fold(text);
  const segments: TextSegment[] = [];
  let cursor = 0;
  let from = folded.text.indexOf(needle);
  while (from !== -1) {
    const start = folded.origin[from] ?? 0;
    const lastOrigin = folded.origin[from + needle.length - 1] ?? start;
    const end = lastOrigin + 1;
    if (start > cursor) {
      segments.push({ text: text.slice(cursor, start), match: false });
    }
    segments.push({ text: text.slice(start, end), match: true });
    cursor = end;
    from = folded.text.indexOf(needle, from + needle.length);
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), match: false });
  }
  return segments;
}
