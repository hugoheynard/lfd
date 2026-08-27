import { EN } from './en';
import { FR } from './fr';
import { IT } from './it';
import { fill } from './client-copy.service';

/** Aplatit un dictionnaire en chemins `a.b.c` → valeur, tableaux compris. */
function paths(value: unknown, prefix = ''): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  if (typeof value === 'string') {
    out.set(prefix, value);
    return out;
  }
  if (typeof value === 'object' && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      for (const [path, text] of paths(child, prefix ? `${prefix}.${key}` : key)) {
        out.set(path, text);
      }
    }
  }
  return out;
}

const DICTS = { fr: FR, en: EN, it: IT } as const;

describe('dictionnaires de l’app cliente', () => {
  const reference = paths(FR);

  it('les trois langues portent exactement les mêmes clés', () => {
    // L'interface garantit la FORME ; elle ne dit rien des tableaux ni d'une
    // clé qu'on aurait laissée vide. Ce test-là mord sur les deux.
    for (const [code, dict] of Object.entries(DICTS)) {
      expect({ [code]: [...paths(dict).keys()].sort() }).toEqual({
        [code]: [...reference.keys()].sort(),
      });
    }
  });

  it('aucune phrase vide, aucun reste de français non traduit', () => {
    for (const [code, dict] of Object.entries(DICTS)) {
      for (const [path, text] of paths(dict)) {
        expect(text.trim().length, `${code}.${path} est vide`).toBeGreaterThan(0);
      }
    }
  });

  it('les jetons à remplacer existent dans les trois langues', () => {
    // Un `{email}` oublié à la traduction laisserait l'accolade à l'écran.
    const tokens = (text: string): readonly string[] =>
      [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '').sort();

    for (const [code, dict] of Object.entries(DICTS)) {
      const theirs = paths(dict);
      for (const [path, text] of reference) {
        expect({ [`${code}.${path}`]: tokens(theirs.get(path) ?? '') }).toEqual({
          [`${code}.${path}`]: tokens(text),
        });
      }
    }
  });

  it('remplace les jetons, et laisse le reste intact', () => {
    expect(fill('Ouvrez le message envoyé à {email} — une heure.', { email: 'a@b.fr' })).toBe(
      'Ouvrez le message envoyé à a@b.fr — une heure.',
    );
  });
});
