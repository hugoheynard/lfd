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
    const { sent, fetchFn } = replying(() => Response.json({ enabled: false, version: 7 }));

    const state = await new DurableObjectShopShelfSwitch(ORIGIN, fetchFn).apply("off");

    expect(state).toEqual({ enabled: false, version: 7 });
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
});
