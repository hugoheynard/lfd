import { UnreadableShelfReplyError } from "../../domain/errors/unreadable-shelf-reply.error.js";
import type { ShelfFetch } from "../durable-object-shop-shelf-cache.js";
import { DurableObjectShopShelfSwitch } from "../durable-object-shop-shelf-switch.js";

/**
 * L'interrupteur HTTP contre des réponses fabriquées — le contrat que
 * `container/pro-shelves.ts` sert au chemin `/switch`.
 */
const ORIGIN = "http://rayons.interne/";

function replying(response: () => Response): {
  readonly sent: { url: string; body: unknown }[];
  readonly fetchFn: ShelfFetch;
} {
  const sent: { url: string; body: unknown }[] = [];
  return {
    sent,
    fetchFn: (url, init) => {
      sent.push({ url, body: init.body });
      return Promise.resolve(response());
    },
  };
}

describe("DurableObjectShopShelfSwitch", () => {
  it("envoie le geste au chemin de l'interrupteur et rend l'état relu", async () => {
    const { sent, fetchFn } = replying(() =>
      Response.json({ enabled: false, publicEnabled: false, version: 7 }),
    );

    const state = await new DurableObjectShopShelfSwitch(ORIGIN, fetchFn).apply("off");

    expect(state).toEqual({ enabled: false, publicEnabled: false, version: 7 });
    expect(sent).toEqual([{ url: "http://rayons.interne/switch", body: '{"action":"off"}' }]);
  });

  it("un refus de l'objet remonte, il ne passe pas pour un succès", async () => {
    const { fetchFn } = replying(() => new Response(null, { status: 403 }));

    await expect(
      new DurableObjectShopShelfSwitch(ORIGIN, fetchFn).apply("purge"),
    ).rejects.toBeInstanceOf(UnreadableShelfReplyError);
  });

  it("un état illisible remonte", async () => {
    const { fetchFn } = replying(() => Response.json({ enabled: "oui", version: 1 }));

    await expect(
      new DurableObjectShopShelfSwitch(ORIGIN, fetchFn).apply("on"),
    ).rejects.toBeInstanceOf(UnreadableShelfReplyError);
  });

  it("allume le rayon public seul, par le même chemin (C3)", async () => {
    const { sent, fetchFn } = replying(() =>
      Response.json({ enabled: true, publicEnabled: true, version: 2 }),
    );

    const state = await new DurableObjectShopShelfSwitch(ORIGIN, fetchFn).apply("public-on");

    expect(state).toEqual({ enabled: true, publicEnabled: true, version: 2 });
    expect(sent[0]?.body).toBe('{"action":"public-on"}');
  });

  it("un état sans drapeau public est illisible : l'objet d'avant C3 ne passe pas pour éteint", async () => {
    const { fetchFn } = replying(() => Response.json({ enabled: true, version: 1 }));

    await expect(
      new DurableObjectShopShelfSwitch(ORIGIN, fetchFn).apply("public-off"),
    ).rejects.toBeInstanceOf(UnreadableShelfReplyError);
  });
});
