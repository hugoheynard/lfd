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

  it("tient la couture avec ce que la gateway indexe", () => {
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

describe("la carte ne montre que ce que cette application opère", () => {
  it("n'a plus de service ni de base « référentiel » séparés", () => {
    // Depuis B2c le référentiel EST cette API : un nœud à part décrirait un
    // Worker qui ne se met plus à jour, et sa base ne parle à personne dans ce
    // processus. Les deux passeraient « aucune preuve » — un angle mort qui
    // ressemble à une panne, sur une carte qu'on consulte pour trancher.
    const ids = TOPOLOGY.map((node) => node.id);

    expect(ids).not.toContain("pim");
    expect(ids).not.toContain("postgres-pim");
  });

  it("garde toute feuille rattachée à quelqu'un", () => {
    // Un tiers dont plus rien ne dépend flotte : il s'affiche sans qu'on sache
    // qui s'en sert, donc sans qu'on sache ce qui tombe avec lui. C'est ce qui
    // serait arrivé à Shopify quand le nœud du référentiel a disparu.
    const dependedUpon = new Set(TOPOLOGY.flatMap((node) => node.dependsOn));
    const floating = TOPOLOGY.filter(
      (node) => node.dependsOn.length === 0 && !dependedUpon.has(node.id),
    );

    expect(floating.map((node) => node.id)).toEqual([]);
  });
});
