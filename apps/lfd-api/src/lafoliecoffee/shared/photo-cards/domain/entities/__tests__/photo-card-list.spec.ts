import {
  BusinessError,
  ResourceNotFoundError,
} from "../../../../../../platform/shared/errors/app-error.js";
import {
  type PhotoCardInsertion,
  PhotoCardList,
  type PhotoCardListRules,
  type PhotoCardText,
} from "../photo-card-list.js";

/**
 * **La liste ordonnée de cartes à photo.**
 *
 * Ce que ce fichier tient : les deux côtés d'ajout, la borne en paramètre, les
 * refus fabriqués par l'usage (et non par la liste), les clés rendues par
 * chaque geste qui orpheline une photo, et un ordre refusé qui ne bouge rien.
 */

class FullError extends BusinessError {
  constructor(readonly max: number) {
    super("test.full", `plein à ${max}`);
  }
}

class CardNotFoundError extends ResourceNotFoundError {
  constructor(readonly cardId: string) {
    super("test.not_found", `carte ${cardId} inconnue`);
  }
}

class OrderStaleError extends BusinessError {
  constructor() {
    super("test.order_stale", "ordre périmé");
  }
}

function rules(insertAt: PhotoCardInsertion, max = 3): PhotoCardListRules {
  return {
    max,
    insertAt,
    refusals: {
      full: (limit) => new FullError(limit),
      cardNotFound: (cardId) => new CardNotFoundError(cardId),
      orderStale: () => new OrderStaleError(),
    },
  };
}

function text(title: string): PhotoCardText {
  return { title, body: "" };
}

function idsOf(list: PhotoCardList<PhotoCardText>): string[] {
  return list.snapshot().map((card) => card.id);
}

/** Trois cartes ajoutées dans l'ordre c1, c2, c3 ; c2 porte une photo. */
function threeCards(insertAt: PhotoCardInsertion = "end"): PhotoCardList<PhotoCardText> {
  const list = PhotoCardList.empty<PhotoCardText>(rules(insertAt));
  list.add("c1", text("Un"), null);
  list.add("c2", text("Deux"), "key-c2");
  list.add("c3", text("Trois"), null);
  return list;
}

describe("PhotoCardList — ajout", () => {
  it("range en fin quand l'usage le demande (les étapes)", () => {
    expect(idsOf(threeCards("end"))).toEqual(["c1", "c2", "c3"]);
  });

  it("range en tête quand l'usage le demande (les notes)", () => {
    expect(idsOf(threeCards("start"))).toEqual(["c3", "c2", "c1"]);
  });

  it("refuse au-delà de la borne de l'usage, avec SA fabrique, sans rien ajouter", () => {
    const list = threeCards();
    let refusal: unknown;
    try {
      list.add("c4", text("De trop"), null);
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toBeInstanceOf(FullError);
    expect(refusal).toMatchObject({ max: 3 });
    expect(list.size).toBe(3);
  });

  it("prend la borne en paramètre : une liste à 1 refuse la deuxième", () => {
    const list = PhotoCardList.empty<PhotoCardText>(rules("start", 1));
    list.add("c1", text("Un"), null);
    expect(() => list.add("c2", text("Deux"), null)).toThrow(FullError);
  });
});

describe("PhotoCardList — révision et photo", () => {
  it("remplace le contenu sans toucher à la photo", () => {
    const list = threeCards();
    list.revise("c2", { title: "Deux bis", body: "détail" });
    expect(list.snapshot()[1]).toEqual({
      id: "c2",
      content: { title: "Deux bis", body: "détail" },
      photoKey: "key-c2",
    });
  });

  it("rend la clé remplacée, puis la clé retirée", () => {
    const list = threeCards();
    expect(list.attachPhoto("c2", "key-c2-bis")).toBe("key-c2");
    expect(list.attachPhoto("c1", "key-c1")).toBeNull();
    expect(list.detachPhoto("c2")).toBe("key-c2-bis");
    expect(list.detachPhoto("c2")).toBeNull();
    expect(list.snapshot()[1]?.photoKey).toBeNull();
  });

  it("refuse une carte inconnue pour chaque geste qui en vise une", () => {
    const list = threeCards();
    expect(() => list.revise("ghost", text("x"))).toThrow(CardNotFoundError);
    expect(() => list.attachPhoto("ghost", "k")).toThrow(CardNotFoundError);
    expect(() => list.detachPhoto("ghost")).toThrow(CardNotFoundError);
    expect(() => list.remove("ghost")).toThrow(CardNotFoundError);
  });
});

describe("PhotoCardList — retrait définitif", () => {
  it("retire la carte et rend la clé de sa photo", () => {
    const list = threeCards();
    expect(list.remove("c2")).toBe("key-c2");
    expect(idsOf(list)).toEqual(["c1", "c3"]);
  });

  it("rend null quand la carte n'avait pas de photo", () => {
    expect(threeCards().remove("c1")).toBeNull();
  });
});

describe("PhotoCardList — réordonner", () => {
  it("range dans l'ordre donné", () => {
    const list = threeCards();
    list.reorder(["c3", "c1", "c2"]);
    expect(idsOf(list)).toEqual(["c3", "c1", "c2"]);
  });

  it.each([
    ["une carte manque", ["c1", "c2"]],
    ["une carte est en trop", ["c1", "c2", "c3", "c4"]],
    ["une carte est répétée", ["c1", "c1", "c2"]],
    ["une carte est inconnue", ["c1", "c2", "ghost"]],
  ])("refuse quand %s, et ne bouge rien", (_, ids) => {
    const list = threeCards();
    expect(() => list.reorder(ids)).toThrow(OrderStaleError);
    expect(idsOf(list)).toEqual(["c1", "c2", "c3"]);
  });
});

describe("PhotoCardList — relecture et copie", () => {
  it("relit un état dans son ordre, sans revérifier la borne", () => {
    const cards = [
      { id: "a", content: text("A"), photoKey: null },
      { id: "b", content: text("B"), photoKey: "kb" },
    ];
    const list = PhotoCardList.of(rules("end", 1), cards);
    expect(list.snapshot()).toEqual(cards);
    expect(list.size).toBe(2);
  });

  it("ne se laisse pas muter par l'état qu'elle a reçu ni par celui qu'elle rend", () => {
    const cards = [{ id: "a", content: text("A"), photoKey: "ka" }];
    const list = PhotoCardList.of(rules("end"), cards);
    const snapshot = list.snapshot();
    list.detachPhoto("a");
    expect(cards[0]?.photoKey).toBe("ka");
    expect(snapshot[0]?.photoKey).toBe("ka");
  });
});
