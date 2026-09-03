import type { DeliveryAddressPayload } from "@lfd/contracts";

import { CompanyAddressNotFoundError } from "../../errors/account-errors.js";
import { DeliveryAddressBook, type DeliveryAddress } from "../delivery-address-book.js";

/**
 * **Le carnet d'adresses de livraison.**
 *
 * Ces cinq règles vivaient en SQL, éclatées sur quatre méthodes d'un adaptateur
 * Prisma : les éprouver demandait un Postgres. Elles sont ici, et ce fichier
 * n'ouvre aucune connexion.
 *
 * ⚠️ **Ce qu'aucun test ne couvre, et c'est voulu** : « deux adresses par défaut ».
 * Le carnet porte un `defaultId` unique — l'état n'a pas de représentation, il
 * n'y a donc rien à vérifier. Un test qui prétendrait le faire testerait le
 * compilateur.
 *
 * Les dates ci-dessous sont absolues **légitimement** : le carnet ne les compare
 * qu'entre elles (l'ordre d'ancienneté), jamais à l'horloge. C'est l'exception
 * étroite de `CLAUDE.md` §5.
 */

const OLDEST = new Date("2026-01-01T08:00:00Z");
const MIDDLE = new Date("2026-01-02T08:00:00Z");
const NEWEST = new Date("2026-01-03T08:00:00Z");
const ARCHIVED_AT = new Date("2026-03-01T12:00:00Z");

/** Une charge de livraison valide — seul `isDefault` varie d'un cas à l'autre. */
function payload(isDefault: boolean): DeliveryAddressPayload {
  return {
    label: "Boutique",
    ligne1: "18 rue des Archives",
    ligne2: "",
    codePostal: "75004",
    ville: "Paris",
    pays: "France",
    isDefault,
    specs: {
      note: "",
      slots: { mode: "everyday", slot: null },
      deliveryContact: null,
      gps: null,
      signatureRequired: null,
    },
  };
}

/** Une entrée telle que la base la rendrait. */
function entry(id: string, createdAt: Date, archivedAt: Date | null = null): DeliveryAddress {
  return {
    id,
    lines: {
      label: id,
      ligne1: "18 rue des Archives",
      ligne2: "",
      codePostal: "75004",
      ville: "Paris",
      pays: "France",
    },
    specs: payload(false).specs,
    createdAt,
    archivedAt,
  };
}

function bookOf(
  entries: readonly DeliveryAddress[],
  defaultId: string | null,
): DeliveryAddressBook {
  return DeliveryAddressBook.reconstitute({ companyId: "c1", entries, defaultId });
}

function emptyBook(): DeliveryAddressBook {
  return bookOf([], null);
}

describe("le carnet d'adresses de livraison", () => {
  describe("l'adresse par défaut", () => {
    /** Un carnet non vide sans défaut ne veut rien dire pour la suite. */
    it("fait de la PREMIÈRE adresse le défaut, même quand elle ne le demande pas", () => {
      const book = emptyBook();

      book.add("a1", payload(false), OLDEST);

      expect(book.defaultId()).toBe("a1");
    });

    it("laisse le défaut en place quand la seconde ne le demande pas", () => {
      const book = emptyBook();
      book.add("a1", payload(false), OLDEST);

      book.add("a2", payload(false), MIDDLE);

      expect(book.defaultId()).toBe("a1");
    });

    it("donne le défaut à la nouvelle venue quand elle le demande", () => {
      const book = emptyBook();
      book.add("a1", payload(false), OLDEST);

      book.add("a2", payload(true), MIDDLE);

      expect(book.defaultId()).toBe("a2");
    });

    it("promeut par désignation explicite", () => {
      const book = bookOf([entry("a1", OLDEST), entry("a2", MIDDLE)], "a1");

      book.makeDefault("a2");

      expect(book.defaultId()).toBe("a2");
    });
  });

  describe("la modification", () => {
    it("promeut quand la charge le demande", () => {
      const book = bookOf([entry("a1", OLDEST), entry("a2", MIDDLE)], "a1");

      book.edit("a2", payload(true));

      expect(book.defaultId()).toBe("a2");
    });

    /**
     * **La règle qui a l'air d'un oubli.** `isDefault: false` sur l'adresse par
     * défaut ne la rétrograde pas : sans remplaçante désignée, le carnet
     * resterait non vide et sans défaut. On retire un défaut en en donnant un
     * autre — jamais en enlevant celui-là.
     */
    it("ne rétrograde JAMAIS le défaut, même quand la charge dit `isDefault: false`", () => {
      const book = bookOf([entry("a1", OLDEST), entry("a2", MIDDLE)], "a1");

      book.edit("a1", payload(false));

      expect(book.defaultId()).toBe("a1");
    });

    it("remplace les lignes postales de l'adresse visée, et d'elle seule", () => {
      const book = bookOf([entry("a1", OLDEST), entry("a2", MIDDLE)], "a1");

      book.edit("a2", { ...payload(false), ville: "Lyon" });

      const villes = book.deliveries().map((address) => address.lines.ville);
      expect(villes).toEqual(["Paris", "Lyon"]);
    });
  });

  describe("l'archivage", () => {
    it("promeut la PLUS ANCIENNE restante quand le défaut s'en va", () => {
      const book = bookOf([entry("a1", OLDEST), entry("a2", MIDDLE), entry("a3", NEWEST)], "a3");

      book.archive("a3", ARCHIVED_AT);

      expect(book.defaultId()).toBe("a1");
    });

    it("ne touche pas au défaut quand une autre adresse s'en va", () => {
      const book = bookOf([entry("a1", OLDEST), entry("a2", MIDDLE)], "a1");

      book.archive("a2", ARCHIVED_AT);

      expect(book.defaultId()).toBe("a1");
    });

    /** Le seul état où `defaultId` vaut légitimement `null`. */
    it("laisse un carnet vide SANS défaut quand la dernière s'en va", () => {
      const book = bookOf([entry("a1", OLDEST)], "a1");

      book.archive("a1", ARCHIVED_AT);

      expect(book.deliveries()).toEqual([]);
      expect(book.defaultId()).toBeNull();
    });

    it("garde l'archivée dans l'état à écrire — jamais de DELETE physique", () => {
      const book = bookOf([entry("a1", OLDEST), entry("a2", MIDDLE)], "a1");

      book.archive("a1", ARCHIVED_AT);

      const written = book.toPersistence().entries;
      expect(written).toHaveLength(2);
      expect(written.find((address) => address.id === "a1")?.archivedAt).toEqual(ARCHIVED_AT);
    });
  });

  describe("ce que le carnet ne contient pas", () => {
    it.each([
      ["modifier", (book: DeliveryAddressBook): void => book.edit("inconnu", payload(false))],
      ["désigner par défaut", (book: DeliveryAddressBook): void => book.makeDefault("inconnu")],
      ["archiver", (book: DeliveryAddressBook): void => book.archive("inconnu", ARCHIVED_AT)],
    ])("refuse de %s une adresse absente", (_geste, act) => {
      const book = bookOf([entry("a1", OLDEST)], "a1");

      expect(() => act(book)).toThrow(CompanyAddressNotFoundError);
    });

    /** Une adresse archivée est déjà partie : elle ne se remodifie pas. */
    it("traite une adresse ARCHIVÉE comme absente", () => {
      const book = bookOf([entry("a1", OLDEST), entry("a2", MIDDLE, ARCHIVED_AT)], "a1");

      expect(() => book.edit("a2", payload(false))).toThrow(CompanyAddressNotFoundError);
      expect(book.holds("a2")).toBe(false);
      expect(book.holds("a1")).toBe(true);
    });
  });

  /**
   * **Régression : le modèle précédent pouvait écrire des carnets bancals.**
   *
   * Tant que le défaut était un `is_default` par ligne, rien n'empêchait un
   * carnet non vide sans aucun défaut, ni un défaut posé sur une adresse
   * archivée — quatre méthodes SQL démotaient et promouvaient à la main. Ces
   * lignes-là existent déjà en base : le carnet les redresse à la lecture plutôt
   * que de propager l'incohérence dans les écrans.
   */
  describe("la rehydratation d'un carnet écrit par l'ancien modèle", () => {
    it("donne un défaut à un carnet non vide qui n'en avait aucun", () => {
      const book = bookOf([entry("a2", MIDDLE), entry("a1", OLDEST)], null);

      expect(book.defaultId()).toBe("a1");
    });

    it("déplace un défaut posé sur une adresse archivée", () => {
      const book = bookOf([entry("a1", OLDEST, ARCHIVED_AT), entry("a2", MIDDLE)], "a1");

      expect(book.defaultId()).toBe("a2");
    });

    it("laisse `null` quand toutes les adresses sont archivées", () => {
      const book = bookOf([entry("a1", OLDEST, ARCHIVED_AT)], "a1");

      expect(book.defaultId()).toBeNull();
    });
  });

  it("rend les adresses de la plus ancienne à la plus récente", () => {
    const book = bookOf([entry("a3", NEWEST), entry("a1", OLDEST), entry("a2", MIDDLE)], "a1");

    expect(book.deliveries().map((address) => address.id)).toEqual(["a1", "a2", "a3"]);
  });
});
