import { UnsubscribeLinks } from "../services/unsubscribe-links.js";
import { FixedOrigins, PlainTokens } from "./marketing-doubles.js";

describe("UnsubscribeLinks — l'URL d'un espace", () => {
  const links = new UnsubscribeLinks(
    new FixedOrigins({ lfc: "https://lafoliecoffee.info" }),
    new PlainTokens(),
  );

  it("l'origine de l'espace, le préfixe de la passerelle, le jeton de la clé normalisée", () => {
    expect(links.urlFor("lfc", " Colette@Halles.fr")).toBe(
      "https://lafoliecoffee.info/api/lfd/mail/unsubscribe/lfc:colette@halles.fr",
    );
  });

  it("sans origine configurée, aucun lien inventé", () => {
    expect(links.urlFor("lfd", "colette@halles.fr")).toBeNull();
  });
});
