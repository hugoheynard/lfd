import { GetEffectiveShopCopyHandler } from "../queries/get-effective-shop-copy.handler.js";
import { GetEffectiveShopCopyQuery } from "../queries/get-effective-shop-copy.query.js";
import { StaticPublished } from "./shop-copy-doubles.js";
import { CART_TITLE, MANIFEST } from "../../domain/__tests__/shop-copy-fixtures.js";

describe("le texte effectif de la boutique (vitrine, S1)", () => {
  it("sert le publié quand il existe, le texte du code sinon, et jamais une orpheline", async () => {
    const handler = new GetEffectiveShopCopyHandler(
      new StaticPublished({
        version: 2,
        texts: { [CART_TITLE.key]: "Mon panier", "retire.du.code": "x" },
      }),
      MANIFEST,
    );

    const texts = await handler.execute(new GetEffectiveShopCopyQuery("en"));

    expect(texts[CART_TITLE.key]).toBe("Mon panier");
    expect(texts).not.toHaveProperty("retire.du.code");
    const others = MANIFEST.entries().filter((entry) => entry.key !== CART_TITLE.key);
    expect(others.length).toBeGreaterThan(0);
    for (const entry of others) {
      expect(texts[entry.key]).toBe(entry.originals.en);
    }
  });
});
