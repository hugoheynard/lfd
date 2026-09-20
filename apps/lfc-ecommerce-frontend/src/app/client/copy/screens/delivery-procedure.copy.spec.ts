import type { DeliveryProcedureEditorLabels } from '@lfd/b2b-ui/company';

import { deliveryProcedureCopy, type DeliveryProcedureCopy } from './delivery-procedure.copy';

/**
 * La parité des trois langues de la procédure de livraison.
 *
 * `client-copy.spec.ts` la tient pour le dictionnaire, et cette copie n'y est pas
 * rangée (le bundle initial, voir `delivery-procedure.copy.ts`) : sans ce spec,
 * une phrase vide ou un `{n}` oublié à la traduction passerait sans bruit.
 */

/**
 * Aplatit en chemins `a.b.c` → texte. Les phrases à trou (des fonctions) n'y
 * entrent pas : le dernier test les appelle une par une.
 */
function paths(value: unknown, prefix = ''): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  if (typeof value === 'string') {
    out.set(prefix, value);
  } else if (typeof value === 'object' && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      for (const [path, text] of paths(child, prefix ? `${prefix}.${key}` : key)) {
        out.set(path, text);
      }
    }
  }
  return out;
}

const LOCALES = ['fr', 'en', 'it'] as const;

describe('la copie de la procédure de livraison', () => {
  const reference = paths(deliveryProcedureCopy('fr'));

  it('les trois langues portent exactement les mêmes clés', () => {
    for (const code of LOCALES) {
      expect({ [code]: [...paths(deliveryProcedureCopy(code)).keys()].sort() }).toEqual({
        [code]: [...reference.keys()].sort(),
      });
    }
  });

  it('aucune phrase vide', () => {
    for (const code of LOCALES) {
      for (const [path, text] of paths(deliveryProcedureCopy(code))) {
        expect(text.trim().length, `${code}.${path} est vide`).toBeGreaterThan(0);
      }
    }
  });

  it('les phrases à trou gardent leur valeur, et `{n}` survit à la traduction', () => {
    for (const code of LOCALES) {
      const copy: DeliveryProcedureCopy = deliveryProcedureCopy(code);
      const editor: DeliveryProcedureEditorLabels = copy.editor;
      expect(editor.stepNumber(7), code).toContain('7');
      expect(editor.reviseHeading(7), code).toContain('7');
      expect(editor.photoAlt('Portail'), code).toContain('Portail');
      expect(copy.steps, code).toContain('{n}');
    }
  });
});
