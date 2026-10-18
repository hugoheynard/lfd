import { SAMPLE_ITEM, SAMPLE_ITEM_XML } from '../vitrine-guide-samples';
import { toVitrineXml } from '../vitrine-xml';

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

  it('échappe le texte', () => {
    expect(toVitrineXml('item', { name: 'Pain & <sel>' })).toContain(
      '<name>Pain &amp; &lt;sel&gt;</name>',
    );
  });

  it("l'exemple XML du guide est dérivé de l'exemple JSON", () => {
    expect(SAMPLE_ITEM_XML).toContain(`<sku>${SAMPLE_ITEM.sku}</sku>`);
    expect(SAMPLE_ITEM_XML).not.toContain('<thumbnail');
  });
});
