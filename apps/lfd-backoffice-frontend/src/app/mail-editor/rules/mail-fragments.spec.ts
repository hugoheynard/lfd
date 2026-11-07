import type { FreeBlock } from '@lfd/mail-blocks';
import { describe, expect, it } from 'vitest';

import { freeBlockFallback, isSafeMailFragment, phrasePathsIn } from './mail-fragments';

/** Le fragment réel de `customer.order-ready` (plan § 22, cas `specimen`, `fr`). */
const BODY =
  '<p style="margin:0;line-height:1.6;white-space:pre-line;"><span data-phrase="introPickup" data-variant="Commande en retrait">Votre commande vous attend au comptoir.</span>\n\nEXEMPLE-0001</p>';

describe('isSafeMailFragment — la défense en profondeur du canevas', () => {
  it('admet les fragments du serveur, styles, tables, images incrustées et liens https', () => {
    expect(isSafeMailFragment(BODY)).toBe(true);
    expect(
      isSafeMailFragment(
        '<table role="presentation"><tr><td><a href="https://exemple.invalid" style="color:#fff">Voir</a><img src="data:image/png;base64,AAAA" alt="" /></td></tr></table>',
      ),
    ).toBe(true);
    expect(isSafeMailFragment('')).toBe(true);
  });

  it('admet un texte échappé qui parle de balises ou d’« once »', () => {
    expect(isSafeMailFragment('<p>Écrivez &lt;script&gt; ; une fois onze=11</p>')).toBe(true);
  });

  it('refuse un script, quelle que soit la casse', () => {
    expect(isSafeMailFragment('<p>a</p><script>alert(1)</script>')).toBe(false);
    expect(isSafeMailFragment('<SCRIPT src="x"></SCRIPT>')).toBe(false);
    expect(isSafeMailFragment('< script>')).toBe(false);
  });

  it('refuse un gestionnaire d’événement dans une balise', () => {
    expect(isSafeMailFragment('<img src="x" onerror="alert(1)">')).toBe(false);
    expect(isSafeMailFragment('<p ONCLICK = "x">a</p>')).toBe(false);
    expect(isSafeMailFragment('<svg/onload=alert(1)>')).toBe(false);
    expect(isSafeMailFragment('<a href="x"onmouseover="y">a</a>')).toBe(false);
  });

  it('refuse une adresse javascript:, même masquée', () => {
    expect(isSafeMailFragment('<a href="javascript:alert(1)">a</a>')).toBe(false);
    expect(isSafeMailFragment('<a href="JavaScript:x">a</a>')).toBe(false);
    expect(isSafeMailFragment('<a href="java&#115;cript:x">a</a>')).toBe(false);
    expect(isSafeMailFragment('<a href="java&#x73;cript:x">a</a>')).toBe(false);
    expect(isSafeMailFragment('<a href="java\tscript:x">a</a>')).toBe(false);
  });
});

describe('phrasePathsIn', () => {
  it('rend les chemins dans l’ordre, sans doublon', () => {
    expect(phrasePathsIn(BODY)).toEqual(['introPickup']);
    expect(
      phrasePathsIn(
        '<span data-phrase="a">x</span><span data-phrase="b.c">y</span><span data-phrase="a">z</span>',
      ),
    ).toEqual(['a', 'b.c']);
    expect(phrasePathsIn('<p>rien</p>')).toEqual([]);
  });
});

describe('freeBlockFallback — la zone d’un bloc libre que le serveur ne rend pas', () => {
  it('pose une zone marquée, texte échappé', () => {
    const block: FreeBlock = { id: 'n<1', kind: 'paragraph', text: { fr: 'a < b & "c"' } };
    expect(freeBlockFallback(block, 'fr')).toBe(
      '<p><span data-free-block="n&lt;1" data-locale="fr">a &lt; b &amp; &quot;c&quot;</span></p>',
    );
    expect(isSafeMailFragment(freeBlockFallback(block, 'fr') ?? '')).toBe(true);
  });

  it('un titre vide dans sa balise, le libellé d’un bouton', () => {
    expect(freeBlockFallback({ id: 't', kind: 'heading', text: {} }, 'en')).toBe(
      '<h2><span data-free-block="t" data-locale="en"></span></h2>',
    );
    expect(
      freeBlockFallback({ id: 'b', kind: 'button', label: { fr: 'Voir' }, href: '' }, 'fr'),
    ).toContain('>Voir</span>');
  });

  it('ni image ni séparateur', () => {
    expect(freeBlockFallback({ id: 'i', kind: 'image', src: '', alt: {} }, 'fr')).toBeNull();
    expect(freeBlockFallback({ id: 'd', kind: 'divider' }, 'fr')).toBeNull();
  });
});
