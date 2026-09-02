import { CATALOG_SNAPSHOT_VERSION, type CatalogSnapshot } from "@lfd/catalog-sync";

import { CatalogDelivery } from "../entities/catalog-delivery.js";
import { DeliveryAlreadyClosedError } from "../errors/catalog-errors.js";

/**
 * Ce que ces cas tiennent : **une arrivée close ne se rouvre pas**.
 *
 * Rejouer une acceptation poserait une seconde version du même catalogue, et une
 * version est immuable par construction. C'est le pendant applicatif de la
 * transition conditionnelle en base — deux clics simultanés n'en font passer
 * qu'un, et le second l'apprend ici.
 */

const snapshot: CatalogSnapshot = {
  version: CATALOG_SNAPSHOT_VERSION,
  // Le sujet de ces cas est l'état de l'arrivée, jamais une date comparée à
  // l'horloge : celle-ci ne sert qu'à remplir le contrat du snapshot.
  generatedAt: "2026-01-01T00:00:00.000Z",
  categories: [],
  products: [],
};

const received = (): CatalogDelivery =>
  CatalogDelivery.receive({
    id: "d_1",
    revisionId: "rev_1",
    snapshot,
    fingerprint: "empreinte-A",
    receivedAt: new Date("2026-01-01T00:00:00.000Z"),
  });

describe("CatalogDelivery", () => {
  it("naît EN ATTENTE, jamais autrement", () => {
    expect(received().currentStatus).toBe("pending");
  });

  it("porte le snapshot entier et l’empreinte de ce qui a été relu", () => {
    const delivery = received();

    expect(delivery.snapshot).toBe(snapshot);
    expect(delivery.fingerprint).toBe("empreinte-A");
    expect(delivery.revisionId).toBe("rev_1");
  });

  describe("l’acceptation", () => {
    it("clôt l’arrivée et retient les SKU écartés", () => {
      const delivery = received();

      delivery.accept(["VIE-001-1"], new Date("2026-01-02T00:00:00.000Z"), "staff_1");

      expect(delivery.currentStatus).toBe("accepted");
      expect(delivery.excludedSkus).toEqual(["VIE-001-1"]);
    });

    /**
     * Un agrégat ne partage pas son état avec l'appelant : celui-ci pourrait le
     * muter après coup, hors de toute règle, et personne ne le verrait.
     */
    it("copie la liste des écartés au lieu de la partager", () => {
      const delivery = received();
      const écartés = ["VIE-001-1"];

      delivery.accept(écartés, new Date(), null);
      écartés.push("VIE-002-1");

      expect(delivery.excludedSkus).toEqual(["VIE-001-1"]);
    });

    it("REFUSE une seconde acceptation", () => {
      const delivery = received();
      delivery.accept([], new Date(), "staff_1");

      expect(() => delivery.accept([], new Date(), "staff_1")).toThrow(DeliveryAlreadyClosedError);
    });
  });

  describe("le remplacement", () => {
    /**
     * Le prix est assumé, et l'écran doit le dire : une relecture en cours est
     * effacée. C'est ce qui fait que l'ordre cesse d'être une question — on ne
     * peut pas valider une arrivée périmée, elle n'existe plus.
     */
    it("marque l’arrivée remplacée, pas acceptée", () => {
      const delivery = received();

      delivery.supersede();

      expect(delivery.currentStatus).toBe("superseded");
    });

    it("REFUSE de remplacer une arrivée déjà validée", () => {
      const delivery = received();
      delivery.accept([], new Date(), null);

      expect(() => delivery.supersede()).toThrow(DeliveryAlreadyClosedError);
    });

    /** Une arrivée remplacée ne se valide pas : elle n'existe plus pour personne. */
    it("REFUSE de valider une arrivée remplacée", () => {
      const delivery = received();
      delivery.supersede();

      expect(() => delivery.accept([], new Date(), null)).toThrow(DeliveryAlreadyClosedError);
    });

    /**
     * 🔴 Le message distingue les deux fins, parce qu'elles n'appellent pas le
     * même geste : « déjà validée » veut dire qu'il n'y a rien à faire, «
     * remplacée » veut dire qu'il faut recharger et tout relire.
     */
    it("dit laquelle des deux fins, et le geste qui en sort", () => {
      const remplacée = received();
      remplacée.supersede();
      const validée = received();
      validée.accept([], new Date(), null);

      expect(() => remplacée.accept([], new Date(), null)).toThrow(/rechargez/i);
      expect(() => validée.accept([], new Date(), null)).toThrow(/déjà été validée/i);
    });
  });

  it("rend un état persistable qui reflète les transitions", () => {
    const delivery = received();
    const at = new Date("2026-01-02T00:00:00.000Z");

    delivery.accept(["VIE-001-1"], at, "staff_1");

    expect(delivery.toPersistence()).toMatchObject({
      id: "d_1",
      status: "accepted",
      excludedSkus: ["VIE-001-1"],
      acceptedAt: at,
      acceptedBy: "staff_1",
    });
  });

  it("se rehydrate dans l’état où on l’a laissée", () => {
    const closed = CatalogDelivery.from({
      id: "d_9",
      revisionId: "rev_9",
      snapshot,
      fingerprint: "h",
      status: "accepted",
      excludedSkus: [],
      receivedAt: new Date(),
      acceptedAt: new Date(),
      acceptedBy: "staff_1",
    });

    expect(closed.currentStatus).toBe("accepted");
    expect(() => closed.supersede()).toThrow(DeliveryAlreadyClosedError);
  });
});
