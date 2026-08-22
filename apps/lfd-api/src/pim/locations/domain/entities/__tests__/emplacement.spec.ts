import { EmplacementNameRequiredError } from "../../errors/locations-errors.js";
import { Emplacement } from "../emplacement.js";

function open(over: Partial<Parameters<typeof Emplacement.open>[0]> = {}): Emplacement {
  return Emplacement.open({
    id: "emp_1",
    name: "Village",
    clickCollect: true,
    surPlace: true,
    baseUrl: " https://order.example ",
    tableCount: 3,
    ...over,
  });
}

describe("l'agrégat Emplacement", () => {
  it("exige un nom, et trime l'adresse", () => {
    expect(() => open({ name: "   " })).toThrow(EmplacementNameRequiredError);
    expect(open().snapshot().baseUrl).toBe("https://order.example");
  });

  it("n'ouvre aucune table sans salle", () => {
    expect(open({ surPlace: false, tableCount: 12 }).snapshot().tables).toEqual([]);
  });

  it("VIDE la grille quand la salle ferme", () => {
    // L'invariant central. Il vivait dans un `if` du handler de mise à jour, et
    // la persistance l'écrivait en DEUX fois : entre les deux, un emplacement
    // fermé gardait ses tables — donc des QR imprimés qui menaient quelque part.
    const emplacement = open();
    expect(emplacement.tables).toHaveLength(3);

    emplacement.setSurPlace(false);

    expect(emplacement.snapshot().tables).toEqual([]);
  });

  it("refuse de repeupler la grille d'un emplacement sans salle", () => {
    // Le chemin qui restait ouvert : un patch qui coupe la salle ET envoie un
    // nombre de tables. L'ordre des appels ne doit pas décider de l'invariant.
    const emplacement = open();
    emplacement.setSurPlace(false);

    emplacement.setTableCount(8);

    expect(emplacement.snapshot().tables).toEqual([]);
  });

  it("préserve l'état QR des tables conservées quand la grille rétrécit", () => {
    // Le numéro EST l'identité de l'URL imprimée : regénérer un token pour une
    // table qui n'a pas bougé invaliderait un QR encore collé sur la table.
    const emplacement = open({ tableCount: 3 });
    emplacement.attachQr(2, "tok_2");

    emplacement.setTableCount(2);

    const tables = emplacement.snapshot().tables;
    expect(tables.map((table) => table.number)).toEqual([1, 2]);
    expect(tables.find((table) => table.number === 2)?.token).toBe("tok_2");
  });

  it("dit « non » plutôt que de lever quand la table n'existe pas", () => {
    // Le domaine ne connaît pas les codes HTTP : il rend un refus, le handler
    // le traduit en 404.
    const emplacement = open({ tableCount: 2 });

    expect(emplacement.attachQr(9, "tok")).toBe(false);
    expect(emplacement.detachQr(9)).toBe(false);
    expect(emplacement.attachQr(1, "tok")).toBe(true);
  });

  it("remplace le token à chaque génération — l'ancien QR cesse d'ouvrir", () => {
    const emplacement = open({ tableCount: 1 });
    emplacement.attachQr(1, "tok_a");
    emplacement.attachQr(1, "tok_b");

    expect(emplacement.snapshot().tables[0]?.token).toBe("tok_b");
  });
});
