import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { CURRENT_DRIVER_NOTICE } from "../driver-information-notice.js";

/** La version que le registre déclare avoir vue (`lint:rgpd-staff`, 4ᵉ contrôle). */
function registryVersion(): unknown {
  const path = fileURLToPath(
    new URL("../../../../../../../documentation/legal/rgpd-registre.json", import.meta.url),
  );
  const registry: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (typeof registry !== "object" || registry === null || !("texteInformation" in registry)) {
    return undefined;
  }
  const text: unknown = registry.texteInformation;
  return typeof text === "object" && text !== null && "version" in text ? text.version : undefined;
}

/**
 * La porte `lint:rgpd-staff` lie l'empreinte des données du livreur à une
 * version ; ce test lie cette version au texte que le livreur voit. Sans lui,
 * on pourrait changer le texte (ou le registre) sans changer l'autre.
 */
describe("le texte d'information et le registre RGPD", () => {
  it("portent la même version", () => {
    expect(registryVersion()).toBe(CURRENT_DRIVER_NOTICE.version);
  });
});
