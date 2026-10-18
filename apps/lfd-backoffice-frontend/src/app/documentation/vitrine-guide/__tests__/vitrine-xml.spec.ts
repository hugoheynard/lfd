import { SAMPLE_ITEM, SAMPLE_ITEM_XML } from '../vitrine-guide-samples';
import { toVitrineXml } from '../vitrine-xml';

const SERVER_ITEM_XML = `<?xml version="1.0" encoding="UTF-8"?>
<item>
  <sku>VIE-001</sku>
  <name>Croissant au beurre</name>
  <note>Beurre AOP Charentes-Poitou</note>
  <image>
    <url>https://…/croissant.jpg</url>
    <alt>Croissant doré sur une planche</alt>
    <width>1600</width>
    <height>1200</height>
    <focal>
      <x>0.5</x>
      <y>0.4</y>
    </focal>
  </image>
  <unitPriceMillicents>120000</unitPriceMillicents>
  <unitPriceTtcCents>127</unitPriceTtcCents>
  <catalogPriceMillicents>135000</catalogPriceMillicents>
  <vatRatePercent>5.5</vatRatePercent>
  <shelfId>cat_viennoiseries</shelfId>
  <isFeatured>true</isFeatured>
  <audience>both</audience>
</item>
`;

describe('toVitrineXml', () => {
  it('nomme chaque élément comme le champ JSON, en camelCase', () => {
    expect(toVitrineXml('item', { unitPriceTtcCents: 127 })).toContain(
      '<unitPriceTtcCents>127</unitPriceTtcCents>',
    );
  });

  it('ne produit aucun élément pour null ni pour un champ absent', () => {
    const xml = toVitrineXml('item', { note: null, thumbnail: undefined, sku: 'VIE-001' });
    expect(xml).not.toContain('note');
    expect(xml).not.toContain('thumbnail');
  });

  it('rend un tableau au pluriel contenant des éléments au singulier', () => {
    const xml = toVitrineXml('operation', { skus: ['VIE-001', 'VIE-002'] });
    expect(xml).toContain('<skus>\n    <sku>VIE-001</sku>\n    <sku>VIE-002</sku>\n  </skus>');
  });

  it("refuse un tableau dont le singulier n'est pas promis", () => {
    expect(() => toVitrineXml('x', { tags: ['a'] })).toThrow(/tags/);
  });

  it('échappe le texte comme le serveur', () => {
    expect(toVitrineXml('item', { name: `Pain & <sel> "l'ami"\u0007` })).toContain(
      '<name>Pain &amp; &lt;sel&gt; &quot;l&apos;ami&quot;</name>',
    );
  });

  /**
   * Le même texte que `GUIDE_ITEM_XML` de la spec du serveur
   * (`apps/lfd-api/src/b2b/vitrine/http/xml/__tests__/vitrine-xml.spec.ts`) :
   * l'exemple du guide EST la sortie servie, à l'octet.
   */
  it("l'exemple XML du guide est la sortie exacte du serveur", () => {
    expect(SAMPLE_ITEM_XML).toBe(SERVER_ITEM_XML);
  });

  it("l'exemple XML du guide est dérivé de l'exemple JSON", () => {
    expect(SAMPLE_ITEM_XML).toContain(`<sku>${SAMPLE_ITEM.sku}</sku>`);
    expect(SAMPLE_ITEM_XML).not.toContain('<thumbnail');
  });
});
