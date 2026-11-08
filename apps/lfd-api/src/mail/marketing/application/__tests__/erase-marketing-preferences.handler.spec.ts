import { MarketingPreference } from "../../domain/entities/marketing-preference.js";
import { EraseMarketingPreferencesCommand } from "../commands/erase-marketing-preferences.command.js";
import { marketingWorld } from "./marketing-world.js";

const ADDRESS = "colette@halles.fr";
const EARLIER = new Date(Date.UTC(2025, 11, 1));

describe("EraseMarketingPreferencesHandler (règle 23)", () => {
  it("supprime un accord, garde l'empreinte d'une désinscription — qui protège encore", async () => {
    const w = marketingWorld();
    const address = w.addresses.of(ADDRESS);
    await w.preferences.save(
      MarketingPreference.accepted("p_lfd", "lfd", address, {
        proof: { textVersion: "lfd-1", locale: "fr", place: "signup", ref: null },
        origin: "direct",
        at: EARLIER,
      }),
    );
    await w.consent.unsubscribe("lfc", ADDRESS, "link");

    await w.erase.execute(new EraseMarketingPreferencesCommand(" Colette@Halles.fr "));

    expect(w.preferences.forgotten).toEqual(["p_lfd"]);
    const [kept] = await w.preferences.loadAll(address.print);
    expect(kept?.snapshot()).toMatchObject({
      space: "lfc",
      recipientKey: null,
      status: "unsubscribed",
    });
    expect(await w.consent.preferenceOf("lfc", ADDRESS)).toBe("unsubscribed");
    expect(await w.consent.preferenceOf("lfd", ADDRESS)).toBeNull();
  });

  it("une adresse inconnue : rien à faire", async () => {
    const w = marketingWorld();
    await w.erase.execute(new EraseMarketingPreferencesCommand(ADDRESS));
    expect(w.preferences.saves).toBe(0);
  });
});
