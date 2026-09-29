import {
  escapeHtml,
  formatParisDate,
  privacyPageUnavailable,
  renderPrivacyPage,
} from './privacy-page.render';

// Les dates ci-dessous ne sont comparées qu'à leur propre rendu, jamais à
// l'horloge : elles peuvent rester absolues (CLAUDE.md §5).
const LATE_EVENING_UTC_ON_MARCH_31 = '2026-03-31T22:30:00.000Z';

function prose(title: string, body: string) {
  return { title, body };
}

function paragraph(id: string, title: string, body: string) {
  return { id, fr: prose(title, body), en: prose('EN', 'EN'), it: prose('IT', 'IT') };
}

function view(paragraphs: readonly unknown[], title = 'Politique de confidentialité') {
  return {
    content: { title: { fr: title, en: 'Privacy', it: 'Privacy' }, paragraphs },
    revision: 3,
    updatedAt: LATE_EVENING_UTC_ON_MARCH_31,
    updatedBy: 'Hugo',
  };
}

describe('renderPrivacyPage', () => {
  it('rend un document complet en français, un h2 ancré par paragraphe', () => {
    const page = renderPrivacyPage(
      view([
        paragraph('01JA', 'Responsable du traitement', 'La Folie Douce'),
        paragraph('01JB', 'Suppression des données', 'Écrivez-nous.'),
      ]),
    );

    expect(page.status).toBe(200);
    expect(page.html.startsWith('<!doctype html><html lang="fr">')).toBe(true);
    expect(page.html).toContain('<title>Politique de confidentialité</title>');
    expect(page.html).toContain('<h1>Politique de confidentialité</h1>');
    expect(page.html).toContain('<h2 id="01JA">Responsable du traitement</h2>');
    expect(page.html).toContain('<h2 id="01JB">Suppression des données</h2>');
    expect(page.html.indexOf('01JA')).toBeLessThan(page.html.indexOf('01JB'));
    expect(page.html).not.toContain('EN');
    expect(page.html).not.toContain('<script');
  });

  it("n'interprète aucun HTML venu du back-office, pas même dans l'ancre", () => {
    const page = renderPrivacyPage(
      view(
        [paragraph('x" onmouseover="alert(1)', '<b>Titre</b>', '<script>alert(1)</script> & co')],
        'Titre <img src=x>',
      ),
    );

    expect(page.html).toContain('<title>Titre &lt;img src=x&gt;</title>');
    expect(page.html).toContain('id="x&quot; onmouseover=&quot;alert(1)"');
    expect(page.html).toContain('&lt;b&gt;Titre&lt;/b&gt;');
    expect(page.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; co');
    expect(page.html).not.toContain('<script>');
    expect(page.html).not.toContain('<b>');
  });

  it('garde les retours à la ligne du corps, sans fabriquer de balise', () => {
    const page = renderPrivacyPage(view([paragraph('01JA', 'Titre', 'ligne 1\nligne 2')]));

    expect(page.html).toContain('<p class="body">ligne 1\nligne 2</p>');
    expect(page.html).toContain('.body{white-space:pre-line}');
  });

  it('date la mise à jour au jour de Paris, pas à celui d’UTC', () => {
    const page = renderPrivacyPage(view([paragraph('01JA', 'Titre', 'Corps')]));

    expect(page.html).toContain('Dernière mise à jour : 1 avril 2026');
  });

  it('rend 503 pour un document sans paragraphe : une politique vide n’est pas une politique', () => {
    const page = renderPrivacyPage(view([]));

    expect(page.status).toBe(503);
    expect(page.html).toBe(privacyPageUnavailable().html);
    expect(page.warnings).toContain(
      'Politique de confidentialité sans aucun paragraphe : page servie en 503.',
    );
  });

  it.each([
    ['rien', null],
    ['un texte', 'erreur'],
    ['un tableau', []],
    [
      'un document sans titre français',
      { ...view([paragraph('a', 'T', 'C')]), content: { title: {}, paragraphs: [] } },
    ],
    ['une date illisible', { ...view([paragraph('a', 'T', 'C')]), updatedAt: 'hier' }],
    ['un paragraphe sans identifiant', view([{ fr: prose('T', 'C') }])],
    ['un paragraphe au corps vide', view([paragraph('a', 'T', '  ')])],
    [
      'des paragraphes qui ne sont pas une liste',
      { ...view([]), content: { title: { fr: 'T' }, paragraphs: {} } },
    ],
  ])('rend 503 pour %s', (_case, payload) => {
    const page = renderPrivacyPage(payload);

    expect(page.status).toBe(503);
  });
});

describe('privacyPageUnavailable', () => {
  it('dit en français ce qui arrive et quoi faire, dans une page complète', () => {
    const page = privacyPageUnavailable();

    expect(page.status).toBe(503);
    expect(page.html).toContain('<html lang="fr">');
    expect(page.html).toContain('momentanément indisponible');
    expect(page.html).toContain('Réessayez dans quelques minutes');
  });
});

describe('escapeHtml', () => {
  it('échappe les cinq caractères qui ouvrent une balise ou un attribut', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });
});

describe('formatParisDate', () => {
  it('écrit la date en toutes lettres', () => {
    expect(formatParisDate(new Date('2026-07-14T10:00:00.000Z'))).toBe('14 juillet 2026');
  });
});
