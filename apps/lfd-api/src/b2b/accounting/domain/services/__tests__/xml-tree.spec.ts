import { InvalidBankReturnFileError } from "../../errors/bank-return-file-errors.js";
import { at, parseXml, textAt } from "../xml-tree.js";

describe("le lecteur XML minimal", () => {
  it("lit éléments, préfixes, attributs, entités et CDATA", () => {
    const root = parseXml(
      `<?xml version="1.0"?><!-- c --><ns:Doc xmlns:ns="urn:x"><ns:A Ccy='EUR'>1 &amp; 2 &#233;</ns:A><B><![CDATA[<brut>]]></B><C/></ns:Doc>`,
    );

    expect(root.name).toBe("Doc");
    expect(textAt(root, "A")).toBe("1 & 2 é");
    expect(at(root, "A")?.attributes.get("Ccy")).toBe("EUR");
    expect(textAt(root, "B")).toBe("<brut>");
    expect(at(root, "C")).not.toBeNull();
    expect(textAt(root, "C")).toBeNull();
  });

  it.each([
    [
      "un DOCTYPE (entités externes)",
      `<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><a>&e;</a>`,
    ],
    ["une entité inconnue", "<a>&e;</a>"],
    ["une balise mal fermée", "<a><b></a></b>"],
    ["une balise non fermée", "<a><b></b>"],
    ["deux racines", "<a/><b/>"],
    ["du texte hors racine", "texte<a/>"],
    ["un document vide", "   "],
    ["un caractère hors Unicode", "<a>&#x110000;</a>"],
  ])("refuse %s", (_, xml) => {
    expect(() => parseXml(xml)).toThrow(InvalidBankReturnFileError);
  });
});
