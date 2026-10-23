import type { VitrineCatalogueView, VitrineItemView } from "@lfd/contracts";

import { VITRINE_XSD } from "../../vitrine-representation.js";
import { VITRINE_XML_ROOTS } from "../vitrine-xml-shapes.js";
import { escapeXmlText, VitrineXmlShapeMismatchError, writeXml } from "../xml-writer.js";

/**
 * L'article de l'exemple du guide de l'agence (`vitrine-guide-samples.ts` du
 * back-office) : sa sortie XML ci-dessous est recopiée À L'IDENTIQUE dans la
 * spec du guide. Si l'une change sans l'autre, une des deux suites rougit.
 */
const GUIDE_ITEM: VitrineItemView = {
  sku: "VIE-001",
  name: "Croissant au beurre",
  note: "Beurre AOP Charentes-Poitou",
  image: {
    url: "https://…/croissant.jpg",
    alt: "Croissant doré sur une planche",
    width: 1600,
    height: 1200,
    focal: { x: 0.5, y: 0.4 },
  },
  thumbnail: {
    url: "https://…/croissant-vignette.jpg",
    alt: "Croissant au beurre",
    width: 800,
    height: 600,
    focal: { x: 0.5, y: 0.3 },
    focale: "0.50,0.30",
  },
  unitPriceMillicents: 120000,
  unitPriceTtcCents: 127,
  unitPriceTTC: "1,27",
  unitPriceHT: "1,20",
  catalogPriceMillicents: 135000,
  vatRatePercent: 5.5,
  shelfId: "cat_viennoiseries",
  shelfName: "Viennoiseries",
  URLProduct: "https://…/boutique/article/VIE-001",
  isFeatured: true,
  audience: "both",
};

const GUIDE_ITEM_XML = `<?xml version="1.0" encoding="UTF-8"?>
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
  <thumbnail>
    <url>https://…/croissant-vignette.jpg</url>
    <alt>Croissant au beurre</alt>
    <width>800</width>
    <height>600</height>
    <focal>
      <x>0.5</x>
      <y>0.3</y>
    </focal>
    <focale>0.50,0.30</focale>
  </thumbnail>
  <unitPriceMillicents>120000</unitPriceMillicents>
  <unitPriceTtcCents>127</unitPriceTtcCents>
  <unitPriceTTC>1,27</unitPriceTTC>
  <unitPriceHT>1,20</unitPriceHT>
  <catalogPriceMillicents>135000</catalogPriceMillicents>
  <vatRatePercent>5.5</vatRatePercent>
  <shelfId>cat_viennoiseries</shelfId>
  <shelfName>Viennoiseries</shelfName>
  <URLProduct>https://…/boutique/article/VIE-001</URLProduct>
  <isFeatured>true</isFeatured>
  <audience>both</audience>
</item>
`;

const item = (xml: VitrineItemView): string => writeXml("item", VITRINE_XML_ROOTS.item, xml);

describe("le XML de la vitrine", () => {
  it("rend l'article du guide exactement comme le guide le montre", () => {
    expect(item(GUIDE_ITEM)).toBe(GUIDE_ITEM_XML);
  });

  it("ne produit aucun élément pour null ni pour un champ absent", () => {
    const xml = item({ ...GUIDE_ITEM, note: null, thumbnail: null });
    expect(xml).not.toContain("<note");
    expect(xml).not.toContain("<thumbnail");
    expect(xml).not.toContain("<operation");
  });

  it("rend la focale vide quand la médiathèque n'a pas posé de point focal", () => {
    const thumbnail = { url: "u", alt: "a", width: null, height: null, focal: null, focale: "" };
    const xml = item({ ...GUIDE_ITEM, thumbnail });
    expect(xml).toContain(
      "<thumbnail>\n    <url>u</url>\n    <alt>a</alt>\n    <focale></focale>\n  </thumbnail>",
    );
  });

  it("échappe le nom du rayon et le nom de l'article", () => {
    const xml = item({ ...GUIDE_ITEM, name: "Pain & <sel>", shelfName: "Pains & co" });
    expect(xml).toContain("<name>Pain &amp; &lt;sel&gt;</name>");
    expect(xml).toContain("<shelfName>Pains &amp; co</shelfName>");
  });

  it("garde le multilingue en éléments par langue, et les tableaux au pluriel", () => {
    const view: VitrineCatalogueView = {
      language: "en",
      shelves: [],
      items: [],
      operations: [
        {
          key: "galette",
          name: { fr: "Galette", en: "King cake" },
          lede: null,
          image: null,
          state: "open",
          orderFrom: "2026-01-01",
          orderUntil: "2026-01-10",
          pickupFrom: "2026-01-02",
          pickupUntil: "2026-01-11",
          skus: ["GAL-01", "GAL-02"],
        },
      ],
    };
    const xml = writeXml("catalogue", VITRINE_XML_ROOTS.catalogue, view);
    expect(xml).toContain("<shelves/>");
    expect(xml).toContain(
      "<name>\n        <fr>Galette</fr>\n        <en>King cake</en>\n      </name>",
    );
    expect(xml).toContain(
      "<skus>\n        <sku>GAL-01</sku>\n        <sku>GAL-02</sku>\n      </skus>",
    );
    expect(xml).not.toContain("<lede");
  });

  it("porte la clé d'un texte en attribut, échappée", () => {
    const xml = writeXml("texts", VITRINE_XML_ROOTS.texts, {
      language: "fr",
      texts: { "product.bestSeller": "L'incontournable" },
    });
    expect(xml).toContain('<text key="product.bestSeller">L&apos;incontournable</text>');
  });

  it("échappe les cinq caractères réservés", () => {
    expect(escapeXmlText(`Pain & <sel> "dit" l'ami`)).toBe(
      "Pain &amp; &lt;sel&gt; &quot;dit&quot; l&apos;ami",
    );
  });

  it("retire les caractères qu'XML 1.0 interdit, garde tabulation, sauts de ligne et emoji", () => {
    expect(escapeXmlText("a\u0000b\u0007c\u001Fd￾e\uD800f")).toBe("abcdef");
    expect(escapeXmlText("a\tb\nc\rd 🥐")).toBe("a\tb\nc\rd 🥐");
  });

  it("écrit un décimal sans exposant", () => {
    const image = { url: "u", alt: "a", width: null, height: null, focal: { x: 1e-7, y: 0 } };
    const xml = item({ ...GUIDE_ITEM, image });
    expect(xml).toContain("<x>0.0000001</x>");
  });

  it("refuse un champ que le schéma ne déclare pas, au lieu d'une sortie invalide", () => {
    expect(() => writeXml("item", VITRINE_XML_ROOTS.item, { ...GUIDE_ITEM, secret: 1 })).toThrow(
      VitrineXmlShapeMismatchError,
    );
  });

  it("refuse un obligatoire absent et une valeur hors liste", () => {
    const withoutSku = Object.fromEntries(
      Object.entries(GUIDE_ITEM).filter(([key]) => key !== "sku"),
    );
    expect(() => writeXml("item", VITRINE_XML_ROOTS.item, withoutSku)).toThrow(/sku/);
    expect(() =>
      writeXml("item", VITRINE_XML_ROOTS.item, { ...GUIDE_ITEM, audience: "nobody" }),
    ).toThrow(/audience/);
  });
});

describe("le XSD de la vitrine", () => {
  it("déclare les trois racines, sans espace de noms", () => {
    for (const root of ["catalogue", "item", "texts"]) {
      expect(VITRINE_XSD).toMatch(new RegExp(`^  <xs:element name="${root}">`, "m"));
    }
    expect(VITRINE_XSD).not.toContain("targetNamespace");
  });

  it("déclare chaque élément que l'article du guide produit", () => {
    const names = new Set([...item(GUIDE_ITEM).matchAll(/<([A-Za-z]+)[ >/]/g)].map((m) => m[1]));
    for (const name of names) {
      expect(VITRINE_XSD).toContain(`name="${String(name)}"`);
    }
  });

  it("rend facultatif ce qui peut être null, et contraint les valeurs closes", () => {
    expect(VITRINE_XSD).toContain('<xs:element name="note" minOccurs="0" type="xs:string"/>');
    expect(VITRINE_XSD).toContain('<xs:enumeration value="both"/>');
    expect(VITRINE_XSD).toContain('<xs:attribute name="key" type="xs:string" use="required"/>');
  });
});
