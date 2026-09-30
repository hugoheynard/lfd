import { InvalidPurchaseUrlError } from "../../errors/delivery-purchase-errors.js";
import { PURCHASE_URL_MAX_LENGTH, PurchaseUrl } from "../purchase-url.js";

describe("PurchaseUrl", () => {
  it("accepte une adresse https, rognée et normalisée", () => {
    expect(PurchaseUrl.of("  https://Exemple.fr/caisse?ref=50  ").value).toBe(
      "https://exemple.fr/caisse?ref=50",
    );
  });

  it.each([
    ["http (en clair)", "http://exemple.fr/caisse", /commence par « http: »/u],
    ["javascript:", "javascript:alert(1)", /commence par « javascript: »/u],
    ["data:", "data:text/html,<b>x</b>", /commence par « data: »/u],
    ["ftp", "ftp://exemple.fr/caisse", /commence par « ftp: »/u],
    ["une adresse sans schéma", "exemple.fr/caisse", /pas une adresse web complète/u],
    ["du texte", "voir le catalogue", /pas une adresse web complète/u],
    ["un identifiant dans l'adresse", "https://moi:secret@exemple.fr/", /identifiant/u],
  ])("refuse %s", (_label, raw, message) => {
    expect(() => PurchaseUrl.of(raw)).toThrow(InvalidPurchaseUrlError);
    expect(() => PurchaseUrl.of(raw)).toThrow(message);
  });

  it("refuse une adresse trop longue", () => {
    const long = `https://exemple.fr/${"a".repeat(PURCHASE_URL_MAX_LENGTH)}`;
    expect(() => PurchaseUrl.of(long)).toThrow(/dépasse 2000 caractères/u);
  });
});
