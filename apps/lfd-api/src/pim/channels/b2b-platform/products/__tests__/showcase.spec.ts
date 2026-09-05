import { showcaseOf } from "../showcase.js";
import type {
  ProductEditorialView,
  ProductMediaRecord,
} from "../../../../catalogue/product/domain/ports/editorial-reader.js";
import type { ProductRecord } from "../../../../catalogue/product/domain/ports/product.repository.js";

/**
 * Une fiche ENTIÈRE, et pas un objet réduit à son identifiant.
 *
 * Seul `id` compte pour ce calcul, mais un doublé qui ment sur sa forme laisse
 * la vitrine dériver du port sans que rien ne rougisse : la signature change, le
 * cast l'avale, le test reste vert sur du code mort.
 */
const product = (id: string): ProductRecord => ({
  id,
  sku: `SKU-${id}`,
  name: { fr: "Croissant au beurre" },
  slug: { fr: "croissant-au-beurre" },
  kind: "daily",
  categoryId: "cat_vien",
  status: "published",
  variants: [],
  vatByContext: {},
  channelOverride: null,
});

const media = (over: Partial<ProductMediaRecord> = {}): ProductMediaRecord => ({
  role: "hero",
  url: "https://media.example/croissant.jpg",
  name: "",
  alt: { fr: "Un croissant doré" },
  width: 800,
  height: 800,
  bytes: null,
  contentType: "image/jpeg",
  ...over,
});

const editorial = (over: Partial<ProductEditorialView> = {}): ProductEditorialView => ({
  descriptionShort: { fr: "Tourage patient" },
  descriptionLong: null,
  story: null,
  pairing: null,
  brand: null,
  seoTitle: null,
  seoDescription: null,
  ...over,
});

describe("showcaseOf", () => {
  it("emporte la ligne courte et le packshot", () => {
    const shown = showcaseOf(
      [product("prd_1")],
      new Map([["prd_1", editorial()]]),
      new Map([["prd_1", [media()]]]),
    );

    expect(shown.get("prd_1")).toEqual({
      note: "Tourage patient",
      image: {
        url: "https://media.example/croissant.jpg",
        alt: "Un croissant doré",
        width: 800,
        height: 800,
      },
    });
  });

  /**
   * 🔴 Le rôle décide, pas l'ordre. Prendre le premier visuel ferait dépendre la
   * vitrine de l'ordre de saisie : une photo d'ambiance ajoutée en tête
   * remplacerait le packshot sans que personne ne l'ait décidé.
   */
  it("choisit le visuel par son RÔLE, pas par sa position", () => {
    const shown = showcaseOf(
      [product("prd_1")],
      new Map(),
      new Map([
        [
          "prd_1",
          [
            media({ role: "lifestyle", url: "https://media.example/table.jpg" }),
            media({ role: "hero", url: "https://media.example/piece.jpg" }),
          ],
        ],
      ]),
    );

    expect(shown.get("prd_1")?.image?.url).toBe("https://media.example/piece.jpg");
  });

  /**
   * Une fiche qui n'a que des visuels d'ambiance n'en montre aucun : une photo
   * de table à la place d'un croissant est pire que le vide.
   */
  it("ne montre rien plutôt qu'une photo d'ambiance", () => {
    const shown = showcaseOf(
      [product("prd_1")],
      new Map(),
      new Map([["prd_1", [media({ role: "lifestyle" })]]]),
    );

    expect(shown.get("prd_1")?.image).toBeNull();
  });

  /**
   * `null` = rien n'a été saisi. La chaîne vide dirait « effacé », et l'écran de
   * réception doit pouvoir dire lequel des deux vient d'arriver.
   */
  it("rend `null` — pas la chaîne vide — quand aucun éditorial n'existe", () => {
    const shown = showcaseOf([product("prd_1")], new Map(), new Map());

    expect(shown.get("prd_1")).toEqual({ note: null, image: null });
  });

  it("rend `null` quand l'éditorial existe sans ligne courte", () => {
    const shown = showcaseOf(
      [product("prd_1")],
      new Map([["prd_1", editorial({ descriptionShort: null })]]),
      new Map(),
    );

    expect(shown.get("prd_1")?.note).toBeNull();
  });

  /** Une ligne EFFACÉE traverse telle quelle : elle n'est pas une absence. */
  it("laisse passer une ligne vide, qui n'est pas la même chose qu'aucune", () => {
    const shown = showcaseOf(
      [product("prd_1")],
      new Map([["prd_1", editorial({ descriptionShort: { fr: "" } })]]),
      new Map(),
    );

    expect(shown.get("prd_1")?.note).toBe("");
  });

  it("porte une entrée par produit, même sans rien à montrer", () => {
    const shown = showcaseOf([product("prd_1"), product("prd_2")], new Map(), new Map());

    expect([...shown.keys()]).toEqual(["prd_1", "prd_2"]);
  });
});
