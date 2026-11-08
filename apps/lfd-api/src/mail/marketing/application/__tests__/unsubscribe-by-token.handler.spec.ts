import { MarketingPreference } from "../../domain/entities/marketing-preference.js";
import { UnsubscribeByTokenCommand } from "../commands/unsubscribe-by-token.command.js";
import { marketingWorld, NOW } from "./marketing-world.js";

const ADDRESS = "colette@halles.fr";
const EARLIER = new Date(Date.UTC(2025, 11, 1));

describe("UnsubscribeByTokenHandler (U2, règles 5 et 20)", () => {
  it("désinscrit l'espace du jeton, source `link` pour le bouton de la page", async () => {
    const w = marketingWorld();

    await w.byToken.execute(new UnsubscribeByTokenCommand(`lfc:${ADDRESS}`, false, false));

    expect(await w.consent.preferenceOf("lfc", ADDRESS)).toBe("unsubscribed");
    expect(await w.consent.preferenceOf("lfd", ADDRESS)).toBeNull();
    const [row] = await w.preferences.loadAll(w.addresses.of(ADDRESS).print);
    expect(row?.snapshot()).toMatchObject({ unsubscribedAt: NOW, unsubscribedSource: "link" });
  });

  it("le POST « One-Click » range la source `one_click`", async () => {
    const w = marketingWorld();

    await w.byToken.execute(new UnsubscribeByTokenCommand(`lfc:${ADDRESS}`, true, false));

    const [row] = await w.preferences.loadAll(w.addresses.of(ADDRESS).print);
    expect(row?.snapshot().unsubscribedSource).toBe("one_click");
  });

  it("idempotent : un second POST n'écrit rien et garde le premier instant", async () => {
    const w = marketingWorld();
    await w.byToken.execute(new UnsubscribeByTokenCommand(`lfc:${ADDRESS}`, false, false));
    const saves = w.preferences.saves;

    await w.byToken.execute(new UnsubscribeByTokenCommand(`lfc:${ADDRESS}`, true, false));

    expect(w.preferences.saves).toBe(saves);
  });

  it("un jeton illisible ne lève rien et n'écrit rien (pas d'oracle)", async () => {
    const w = marketingWorld();

    await w.byToken.execute(new UnsubscribeByTokenCommand("n'importe quoi", false, true));

    expect(w.preferences.rows.size).toBe(0);
  });

  it("une ligne acceptée se désinscrit, quelle que soit son origine", async () => {
    const w = marketingWorld();
    const address = w.addresses.of(ADDRESS);
    await w.preferences.save(
      MarketingPreference.accepted("p0", "lfc", address, {
        proof: { textVersion: "lfc-1", locale: "fr", place: "signup", ref: null },
        origin: "partners",
        at: EARLIER,
      }),
    );

    await w.byToken.execute(new UnsubscribeByTokenCommand(`lfc:${ADDRESS}`, false, false));

    expect(await w.consent.preferenceOf("lfc", ADDRESS)).toBe("unsubscribed");
  });

  it("« tout le groupe » désinscrit aussi les autres lignes de l'adresse, source `group`", async () => {
    const w = marketingWorld();
    const address = w.addresses.of(ADDRESS);
    await w.preferences.save(
      MarketingPreference.accepted("p0", "lfd", address, {
        proof: { textVersion: "lfd-1", locale: "fr", place: "signup", ref: null },
        origin: "partners",
        at: EARLIER,
      }),
    );

    await w.byToken.execute(new UnsubscribeByTokenCommand(`lfc:${ADDRESS}`, false, true));

    const rows = await w.preferences.loadAll(address.print);
    expect(rows.map((row) => [row.space, row.snapshot().unsubscribedSource])).toEqual(
      expect.arrayContaining([
        ["lfc", "link"],
        ["lfd", "group"],
      ]),
    );
  });

  it("sans « tout le groupe », les autres espaces ne bougent pas", async () => {
    const w = marketingWorld();
    const address = w.addresses.of(ADDRESS);
    await w.preferences.save(
      MarketingPreference.accepted("p0", "lfd", address, {
        proof: { textVersion: "lfd-1", locale: "fr", place: "signup", ref: null },
        origin: "direct",
        at: EARLIER,
      }),
    );

    await w.byToken.execute(new UnsubscribeByTokenCommand(`lfc:${ADDRESS}`, false, false));

    expect(await w.consent.preferenceOf("lfd", ADDRESS)).toBe("accepted");
  });
});
