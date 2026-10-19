import { renderInlineMarkdown } from '../vitrine-guide-inline';

describe('renderInlineMarkdown', () => {
  it('traduit code, gras et italique', () => {
    expect(renderInlineMarkdown('un `POST` **signé** et *coché*')).toBe(
      'un <code>POST</code> <strong>signé</strong> et <em>coché</em>',
    );
  });

  it('échappe le XML cité au lieu de l’interpréter, et ne lit pas de gras dans un code', () => {
    expect(renderInlineMarkdown('racine `<item>` et `**x**`, puis <b>')).toBe(
      'racine <code>&lt;item&gt;</code> et <code>**x**</code>, puis &lt;b&gt;',
    );
  });
});
