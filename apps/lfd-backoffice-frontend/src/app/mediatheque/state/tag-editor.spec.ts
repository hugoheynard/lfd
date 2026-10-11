import { describe, expect, it } from 'vitest';

import { TagEditor } from './tag-editor';

describe('les mots-clés d’une image en saisie', () => {
  it('normalise ce qu’on ajoute, sans doubler un mot porté', () => {
    const editor = new TagEditor(() => []);
    editor.draft.set('  Pain ');
    expect(editor.written()).toBe('pain');
    editor.add(editor.draft());
    editor.add('PAIN');
    editor.add('   ');
    expect(editor.tags()).toEqual(['pain']);
    expect(editor.draft()).toBe('');
  });

  it('retire un mot, et repart des mots d’une autre image', () => {
    const editor = new TagEditor(() => ['pain', 'brioche']);
    editor.reset(['pain', 'brioche']);
    editor.remove('pain');
    expect(editor.tags()).toEqual(['brioche']);
    editor.draft.set('pa');
    expect(editor.suggestions()).toEqual(['pain']);
    editor.reset([]);
    expect(editor.draft()).toBe('');
  });
});
