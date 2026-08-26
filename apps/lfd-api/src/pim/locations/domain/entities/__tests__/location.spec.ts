import { LocationNameRequiredError } from "../../errors/locations-errors.js";
import { Location } from "../location.js";

function open(over: Partial<Parameters<typeof Location.open>[0]> = {}): Location {
  return Location.open({
    id: "emp_1",
    name: "Village",
    clickCollect: true,
    eatIn: true,
    baseUrl: " https://order.example ",
    tableCount: 3,
    ...over,
  });
}

describe("l'agrégat Location", () => {
  it("exige un nom, et trime l'adresse", () => {
    expect(() => open({ name: "   " })).toThrow(LocationNameRequiredError);
    expect(open().snapshot().baseUrl).toBe("https://order.example");
  });

  it("n'ouvre aucune table sans salle", () => {
    expect(open({ eatIn: false, tableCount: 12 }).snapshot().tables).toEqual([]);
  });

  it("VIDE la grille quand la salle ferme", () => {
    // L'invariant central. Il vivait dans un `if` du handler de mise à jour, et
    // la persistance l'écrivait en DEUX fois : entre les deux, un emplacement
    // fermé gardait ses tables — donc des QR imprimés qui menaient quelque part.
    const location = open();
    expect(location.tables).toHaveLength(3);

    location.setEatIn(false);

    expect(location.snapshot().tables).toEqual([]);
  });

  it("refuse de repeupler la grille d'un emplacement sans salle", () => {
    // Le chemin qui restait ouvert : un patch qui coupe la salle ET envoie un
    // nombre de tables. L'ordre des appels ne doit pas décider de l'invariant.
    const location = open();
    location.setEatIn(false);

    location.setTableCount(8);

    expect(location.snapshot().tables).toEqual([]);
  });

  it("préserve l'état QR des tables conservées quand la grille rétrécit", () => {
    // Le numéro EST l'identité de l'URL imprimée : regénérer un token pour une
    // table qui n'a pas bougé invaliderait un QR encore collé sur la table.
    const location = open({ tableCount: 3 });
    location.attachQr(2, "tok_2");

    location.setTableCount(2);

    const tables = location.snapshot().tables;
    expect(tables.map((table) => table.number)).toEqual([1, 2]);
    expect(tables.find((table) => table.number === 2)?.token).toBe("tok_2");
  });

  it("dit « non » plutôt que de lever quand la table n'existe pas", () => {
    // Le domaine ne connaît pas les codes HTTP : il rend un refus, le handler
    // le traduit en 404.
    const location = open({ tableCount: 2 });

    expect(location.attachQr(9, "tok")).toBe(false);
    expect(location.detachQr(9)).toBe(false);
    expect(location.attachQr(1, "tok")).toBe(true);
  });

  it("remplace le token à chaque génération — l'ancien QR cesse d'ouvrir", () => {
    const location = open({ tableCount: 1 });
    location.attachQr(1, "tok_a");
    location.attachQr(1, "tok_b");

    expect(location.snapshot().tables[0]?.token).toBe("tok_b");
  });
});
