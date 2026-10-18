import {
  VitrineEndpointCarriesSecretError,
  VitrineEndpointInvalidError,
  VitrineEndpointNotHttpsError,
} from "../errors/vitrine-errors.js";
import { VitrineEndpoint } from "../vitrine-endpoint.js";

describe("l'adresse d'un abonné", () => {
  it("accepte une adresse https, port et chemin compris", () => {
    expect(VitrineEndpoint.of(" https://agence.example:8443/hooks/lfc ").value).toBe(
      "https://agence.example:8443/hooks/lfc",
    );
  });

  it("refuse http : la signature partirait en clair", () => {
    expect(() => VitrineEndpoint.of("http://agence.example/hook")).toThrow(
      VitrineEndpointNotHttpsError,
    );
  });

  it.each([
    "https://agence.example/hook?token=secret",
    "https://agence.example/hook?",
    "https://agence.example/hook#x",
    "https://user:pass@agence.example/hook",
  ])("refuse une adresse qui porte un secret affichable : %s", (url) => {
    expect(() => VitrineEndpoint.of(url)).toThrow(VitrineEndpointCarriesSecretError);
  });

  it.each(["", "agence.example/hook", "https://", `https://a.example/${"x".repeat(2100)}`])(
    "refuse ce qui n'est pas une URL : « %s »",
    (url) => {
      expect(() => VitrineEndpoint.of(url)).toThrow(VitrineEndpointInvalidError);
    },
  );
});
