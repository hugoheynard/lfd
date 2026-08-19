import { OBSERVED_BY_GATEWAY, TOPOLOGY } from "../topology.js";

/**
 * La topologie est **déclarée**. Un tableau écrit à la main peut mentir de deux
 * façons, et les deux sont silencieuses — d'où ces tests.
 */
describe("la topologie déclarée", () => {
  it("ne dépend que de nœuds qui existent", () => {
    // Une arête vers un identifiant absent ne casse rien : elle ne montre
    // simplement jamais la dépendance. C'est le genre de trou qu'on ne
    // remarque que le jour où on aurait eu besoin de la voir.
    const known = new Set(TOPOLOGY.map((node) => node.id));
    const dangling = TOPOLOGY.flatMap((node) =>
      node.dependsOn.filter((id) => !known.has(id)).map((id) => `${node.id} → ${id}`),
    );

    expect(dangling).toEqual([]);
  });

  it("n'a pas deux nœuds du même nom", () => {
    expect(new Set(TOPOLOGY.map((node) => node.id)).size).toBe(TOPOLOGY.length);
  });

  it("tient la couture avec ce que la passerelle indexe", () => {
    // Les identifiants observés doivent exister dans la carte, sinon leurs
    // fenêtres de trafic n'atteindraient aucun nœud — et tout passerait en
    // « aucune preuve », ce qui ne ressemble pas à une erreur de couture.
    const known = new Set(TOPOLOGY.map((node) => node.id));

    expect(OBSERVED_BY_GATEWAY.filter((id) => !known.has(id))).toEqual([]);
  });

  it("donne une sonde à tout nœud qu'on ne possède pas", () => {
    // Un nœud externe sans sonde ni trafic n'a AUCUNE source : il resterait
    // gris pour toujours, sans que rien ne dise pourquoi.
    const orphans = TOPOLOGY.filter(
      (node) =>
        (node.kind === "external-api" || node.kind === "datastore") && node.probe === undefined,
    );

    expect(orphans.map((node) => node.id)).toEqual([]);
  });
});
