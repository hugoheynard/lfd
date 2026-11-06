import { InvalidMailRequestError } from "../../errors/mail-request.errors.js";
import { storedPdfsIn, withPdfContents } from "../stored-pdfs.js";

const REF = { store: "customer-documents", key: "orders/o-1/bon.pdf" } as const;

describe("storedPdfsIn — les pièces qu'une demande désigne", () => {
  it("rien dans des données sans pièce", () => {
    expect(storedPdfsIn({ firstName: "Ada", lines: [1, 2], nested: { a: null } })).toEqual([]);
  });

  it("trouve une référence imbriquée, et à la racine", () => {
    expect(storedPdfsIn({ document: { fileName: "b.pdf", pdfStored: REF } })).toEqual([REF]);
    expect(storedPdfsIn({ fileName: "m.pdf", pdfStored: REF, reference: "RUM" })).toEqual([REF]);
  });

  it("trouve les références dans une liste", () => {
    const other = { store: "customer-documents", key: "k2" } as const;
    expect(storedPdfsIn({ docs: [{ pdfStored: REF }, { pdfStored: other }] })).toEqual([
      REF,
      other,
    ]);
  });

  it("refuse une référence mal formée ou un stockage non ouvert, sans deviner", () => {
    expect(() => storedPdfsIn({ pdfStored: { store: "customer-documents", key: " " } })).toThrow(
      InvalidMailRequestError,
    );
    expect(() => storedPdfsIn({ pdfStored: { store: "kbis", key: "k" } })).toThrow(
      /n'est pas ouvert/,
    );
  });
});

describe("withPdfContents — les données telles que le gabarit les attend", () => {
  it("remplace `pdfStored` par `pdfBase64`, et recopie le reste à l'identique", () => {
    const data = { sheet: { reference: "ORD-1" }, document: { fileName: "b.pdf", pdfStored: REF } };

    const filled = withPdfContents(data, (ref) => `contenu:${ref.key}`);

    expect(filled).toEqual({
      sheet: { reference: "ORD-1" },
      document: { fileName: "b.pdf", pdfBase64: "contenu:orders/o-1/bon.pdf" },
    });
    expect(data.document).toHaveProperty("pdfStored");
  });

  it("laisse `null` et les scalaires tels quels", () => {
    expect(withPdfContents({ document: null, n: 3 }, () => "x")).toEqual({ document: null, n: 3 });
  });
});
