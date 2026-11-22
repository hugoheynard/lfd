import { AppConfig } from "../../../../platform/config/app-config.js";
import { ConfiguredPayLinkOrigins } from "../configured-pay-link-origins.js";

describe("ConfiguredPayLinkOrigins", () => {
  const config = new AppConfig();
  const origins = new ConfiguredPayLinkOrigins(config);

  it("connaît La Folie Coffee, sa racine étant celle de l'espace client", () => {
    expect(origins.find("lafoliecoffee")).toEqual({
      name: "lafoliecoffee",
      label: "La Folie Coffee",
      publicRoot: config.clientBaseUrl(),
    });
  });

  it("ne connaît pas une origine hors du registre", () => {
    expect(origins.find("ailleurs")).toBeNull();
  });
});
