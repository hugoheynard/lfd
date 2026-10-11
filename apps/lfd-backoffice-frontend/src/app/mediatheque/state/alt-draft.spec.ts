import { describe, expect, it } from 'vitest';

import { AltDraft } from './alt-draft';
import { ALT_RECOMMENDED_LENGTH } from '../rules/image-facts';

describe('les alternatives en saisie', () => {
  it('laisse vider la langue source — c’est déclarer « pas d’alternative »', () => {
    const draft = new AltDraft();
    draft.write('fr', 'Un croissant');
    draft.write('fr', '');
    expect(draft.valueOf('fr')).toBe('');
  });

  it('écrit une traduction à côté de sa source', () => {
    const draft = new AltDraft();
    draft.write('fr', 'Un croissant');
    draft.write('en', 'A croissant');
    expect(draft.valueOf('en')).toBe('A croissant');
    expect(draft.valueOf('fr')).toBe('Un croissant');
  });

  it('compte sans les blancs de bord, et avertit au-delà de la longueur conseillée', () => {
    const draft = new AltDraft();
    draft.write('fr', '  abc  ');
    expect(draft.lengthOf('fr')).toBe(3);
    expect(draft.tooLong('fr')).toBe(false);
    draft.write('fr', 'x'.repeat(ALT_RECOMMENDED_LENGTH + 1));
    expect(draft.tooLong('fr')).toBe(true);
  });
});
