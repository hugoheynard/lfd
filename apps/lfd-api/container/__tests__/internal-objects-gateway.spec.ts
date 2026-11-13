import {
  answerInternalObjectsCall,
  type InternalObjectStub,
  type InternalObjectsCall,
} from "../internal-objects-gateway";
import { DAY_VERSIONS_ORIGIN, SHELF_STORE_ORIGIN, type InternalObject } from "../internal-objects";
import { INTERNAL_NO_STORE } from "../no-store";
import { PUBLIC_SHELF_PURGE_PATH, PUBLIC_SHELF_TAG, type PurgeableTag } from "../public-shelf";

/**
 * La passerelle conteneur → objets partagés, telle que `worker.ts` l'inscrit.
 * Ces tests figent l'ORDRE des contrôles (appelant, aiguillage, purge, objet) :
 * une purge ouverte à un appelant étranger, ou un objet joint avant le
 * contrôle, les fait échouer.
 */
const TRUSTED = "backend-weur";

/** Un objet doublé : il garde ce qu'il reçoit et répond ce qu'on lui dit. */
class RecordingObject implements InternalObjectStub {
  readonly received: Request[] = [];

  constructor(private readonly reply: () => Response = () => new Response("objet")) {}

  fetch(request: Request): Promise<Response> {
    this.received.push(request);
    return Promise.resolve(this.reply());
  }
}

interface Harness {
  readonly objects: Readonly<Record<InternalObject, RecordingObject>>;
  readonly purges: PurgeableTag[];
  answer(request: Request, containerId: string | undefined): Promise<Response>;
}

function harness(): Harness {
  const objects = { "pro-shelves": new RecordingObject(), "day-versions": new RecordingObject() };
  const purges: PurgeableTag[] = [];
  const answer = (request: Request, containerId: string | undefined) => {
    const call: InternalObjectsCall = {
      request,
      containerId,
      trustedIds: [TRUSTED],
      stubs: {
        "pro-shelves": () => objects["pro-shelves"],
        "day-versions": () => objects["day-versions"],
      },
      relayPublicPurge: (tag) => {
        purges.push(tag);
        return Promise.resolve(new Response(null, { status: 204 }));
      },
    };
    return answerInternalObjectsCall(call);
  };
  return { objects, purges, answer };
}

const purgeRequest = (tag: string) =>
  new Request(`${SHELF_STORE_ORIGIN}${PUBLIC_SHELF_PURGE_PATH}?tag=${tag}`, { method: "POST" });

const reached = (h: Harness) =>
  h.objects["pro-shelves"].received.length + h.objects["day-versions"].received.length;

describe("passerelle des objets partagés — l'appelant d'abord", () => {
  it.each([
    ["absent", undefined],
    ["vide", ""],
    ["étranger", "un-autre-worker"],
  ])("refuse 403 un appelant %s, sans joindre d'objet", async (_label, containerId) => {
    const h = harness();
    const response = await h.answer(new Request(`${SHELF_STORE_ORIGIN}/shelves/k`), containerId);
    expect(response.status).toBe(403);
    expect(reached(h)).toBe(0);
  });

  it("refuse 403 une purge d'un appelant étranger AVANT de la relayer", async () => {
    const h = harness();
    const response = await h.answer(purgeRequest(PUBLIC_SHELF_TAG), "un-autre-worker");
    expect(response.status).toBe(403);
    expect(h.purges).toEqual([]);
  });

  it("refuse 403 un appelant étranger même sur un préfixe inconnu (le 403 précède le 404)", async () => {
    const h = harness();
    const response = await h.answer(new Request("http://objets.interne/inconnu/x"), "étranger");
    expect(response.status).toBe(403);
  });
});

describe("passerelle des objets partagés — l'aiguillage", () => {
  it.each([
    "http://objets.interne/inconnu/x",
    "http://objets.interne/rayons",
    "http://autre.hote/rayons/shelves/k",
  ])("répond 404 sans objet pour %s", async (url) => {
    const h = harness();
    const response = await h.answer(new Request(url), TRUSTED);
    expect(response.status).toBe(404);
    expect(reached(h)).toBe(0);
  });

  it("transmet à l'objet des rayons le chemin SANS préfixe, requête et méthode gardées", async () => {
    const h = harness();
    const response = await h.answer(
      new Request(`${SHELF_STORE_ORIGIN}/shelves/k?revision=r1`, { method: "PUT", body: "corps" }),
      TRUSTED,
    );
    expect(await response.text()).toBe("objet");
    const [received] = h.objects["pro-shelves"].received;
    expect(received?.method).toBe("PUT");
    expect(received === undefined ? null : new URL(received.url).pathname).toBe("/shelves/k");
    expect(received === undefined ? null : new URL(received.url).search).toBe("?revision=r1");
    expect(await received?.text()).toBe("corps");
    expect(h.objects["day-versions"].received).toHaveLength(0);
  });

  it("transmet à l'objet des journées ce qui commence par /journees", async () => {
    const h = harness();
    await h.answer(new Request(`${DAY_VERSIONS_ORIGIN}/day-contents/worksheet/x`), TRUSTED);
    const [received] = h.objects["day-versions"].received;
    expect(received === undefined ? null : new URL(received.url).pathname).toBe(
      "/day-contents/worksheet/x",
    );
    expect(h.objects["pro-shelves"].received).toHaveLength(0);
  });
});

describe("passerelle des objets partagés — la purge publique", () => {
  it("relaie une étiquette de la liste fermée sur /rayons/public/purge, sans joindre l'objet", async () => {
    const h = harness();
    const response = await h.answer(purgeRequest(PUBLIC_SHELF_TAG), TRUSTED);
    expect(response.status).toBe(204);
    expect(h.purges).toEqual([PUBLIC_SHELF_TAG]);
    expect(reached(h)).toBe(0);
  });

  it("refuse 400 une étiquette inconnue, sans relayer", async () => {
    const h = harness();
    const response = await h.answer(purgeRequest("autre-chose"), TRUSTED);
    expect(response.status).toBe(400);
    expect(h.purges).toEqual([]);
    expect(reached(h)).toBe(0);
  });

  it("transmet à l'objet des rayons un GET sur le chemin de purge : seul un POST purge", async () => {
    const h = harness();
    await h.answer(
      new Request(`${SHELF_STORE_ORIGIN}${PUBLIC_SHELF_PURGE_PATH}?tag=${PUBLIC_SHELF_TAG}`),
      TRUSTED,
    );
    expect(h.purges).toEqual([]);
    expect(h.objects["pro-shelves"].received).toHaveLength(1);
  });

  it("ne purge pas sous /journees : la purge n'emprunte que le préfixe des rayons", async () => {
    const h = harness();
    await h.answer(
      new Request(`${DAY_VERSIONS_ORIGIN}${PUBLIC_SHELF_PURGE_PATH}?tag=${PUBLIC_SHELF_TAG}`, {
        method: "POST",
      }),
      TRUSTED,
    );
    expect(h.purges).toEqual([]);
    expect(h.objects["day-versions"].received).toHaveLength(1);
  });
});

describe("passerelle des objets partagés — rien n'est gardé", () => {
  it.each([
    ["un refus 403", new Request(`${SHELF_STORE_ORIGIN}/shelves/k`), "étranger"],
    ["un refus 404", new Request("http://objets.interne/inconnu/x"), TRUSTED],
    ["une purge relayée", purgeRequest(PUBLIC_SHELF_TAG), TRUSTED],
    ["une purge refusée", purgeRequest("autre"), TRUSTED],
    ["une réponse d'objet", new Request(`${SHELF_STORE_ORIGIN}/shelves/k`), TRUSTED],
  ])("pose no-store, private sur %s", async (_label, request, containerId) => {
    const response = await harness().answer(request, containerId);
    expect(response.headers.get("Cache-Control")).toBe(INTERNAL_NO_STORE);
  });

  it("remplace un Cache-Control ouvert posé par l'objet", async () => {
    const h = harness();
    const objects: Readonly<Record<InternalObject, InternalObjectStub>> = {
      "pro-shelves": new RecordingObject(
        () => new Response("x", { headers: { "Cache-Control": "public, max-age=60" } }),
      ),
      "day-versions": h.objects["day-versions"],
    };
    const response = await answerInternalObjectsCall({
      request: new Request(`${SHELF_STORE_ORIGIN}/shelves/k`),
      containerId: TRUSTED,
      trustedIds: [TRUSTED],
      stubs: {
        "pro-shelves": () => objects["pro-shelves"],
        "day-versions": () => objects["day-versions"],
      },
      relayPublicPurge: () => Promise.resolve(new Response(null, { status: 204 })),
    });
    expect(response.headers.get("Cache-Control")).toBe(INTERNAL_NO_STORE);
  });
});
