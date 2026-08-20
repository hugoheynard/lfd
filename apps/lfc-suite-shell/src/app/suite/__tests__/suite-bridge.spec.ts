import { DOCUMENT, Location } from "@angular/common";
import { TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthFacade } from "../../auth/auth.facade";
import { SuiteBridge } from "../suite-bridge";
import { SUITE_CHANNEL } from "@lfd/suite-embed";

/**
 * Origine du **back-office** — les tests tournent en config `development`
 * (suite-config.dev.ts).
 *
 * C'était celle du référentiel jusqu'à sa greffe : il fut le premier locataire
 * du shell, il est devenu un module du back-office. Le shell n'iframe donc plus
 * qu'une application — et il est conservé pour en accueillir d'autres, hors
 * boulangerie.
 */
const ADMIN_ORIGIN = "http://localhost:7317";
const EVIL_ORIGIN = "https://evil.example.com";

function fakeFrame(): { postMessage: ReturnType<typeof vi.fn> } {
  return { postMessage: vi.fn() };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("SuiteBridge", () => {
  let bridge: SuiteBridge;
  let replaceState: ReturnType<typeof vi.fn>;
  let getToken: ReturnType<typeof vi.fn>;
  let authed = true;
  // Fenêtre factice : capture le handler `message` (jsdom MessageEvent ne
  // remplit pas origin/source depuis le dict, on invoque donc le handler direct).
  let messageHandler: ((e: MessageEvent) => void) | undefined;

  function dispatch(origin: string, source: unknown, data: unknown): void {
    messageHandler?.({ origin, source, data } as MessageEvent);
  }

  beforeEach(() => {
    replaceState = vi.fn();
    getToken = vi.fn().mockResolvedValue("tok-123");
    authed = true;
    messageHandler = undefined;
    const fakeWin = {
      addEventListener: (type: string, cb: (e: MessageEvent) => void) => {
        if (type === "message") {
          messageHandler = cb;
        }
      },
    };
    TestBed.configureTestingModule({
      providers: [
        SuiteBridge,
        { provide: DOCUMENT, useValue: { defaultView: fakeWin } },
        { provide: Location, useValue: { replaceState } },
        { provide: AuthFacade, useValue: { isAuthenticated: () => authed, getToken } },
      ],
    });
    bridge = TestBed.inject(SuiteBridge);
    bridge.start();
  });

  it("ignore un message d’une origine hors allowlist", async () => {
    const frame = fakeFrame();
    dispatch(EVIL_ORIGIN, frame, {
      channel: SUITE_CHANNEL,
      kind: "token-request",
      requestId: "r1",
      audience: "pim",
    });
    await flush();
    expect(getToken).not.toHaveBeenCalled();
    expect(frame.postMessage).not.toHaveBeenCalled();
  });

  it("ignore un message qui n’est pas au protocole", async () => {
    const frame = fakeFrame();
    dispatch(ADMIN_ORIGIN, frame, { hello: true });
    await flush();
    expect(frame.postMessage).not.toHaveBeenCalled();
  });

  it("relaie un token pour une origine + audience connues, en ciblant l’origine", async () => {
    // L'audience demandée est **`b2bAdmin`**, celle de la surface staff — c'est
    // ce que le référentiel demande vraiment (`staff-token.interceptor.ts`).
    //
    // Ce test réclamait `pim` : le référentiel avait son audience jusqu'à B2d,
    // qui la lui a retirée puisqu'il est servi par le même backend, derrière le
    // même mur. Le pont a suivi, la production aussi ; le test, non — il est
    // resté rouge, et le bruit du flake inter-suites l'a couvert.
    const frame = fakeFrame();
    dispatch(ADMIN_ORIGIN, frame, {
      channel: SUITE_CHANNEL,
      kind: "token-request",
      requestId: "r1",
      audience: "b2bAdmin",
    });
    await flush();
    expect(getToken).toHaveBeenCalledWith("b2bAdmin");
    expect(frame.postMessage).toHaveBeenCalledWith(
      { channel: SUITE_CHANNEL, kind: "token", requestId: "r1", token: "tok-123" },
      ADMIN_ORIGIN,
    );
  });

  it("rend token=null pour une audience RETIRÉE — `pim` depuis B2d", async () => {
    // On éprouve l'audience retirée plutôt qu'une chaîne manifestement fausse :
    // c'est celle-là qui a réellement dérivé, et c'est celle-là qu'une remise en
    // service devrait forcer à re-décider. Un jeton rendu pour `pim` voudrait
    // dire que le shell a recommencé à ouvrir une porte qu'on a fermée.
    const frame = fakeFrame();
    dispatch(ADMIN_ORIGIN, frame, {
      channel: SUITE_CHANNEL,
      kind: "token-request",
      requestId: "r2",
      audience: "pim",
    });
    await flush();
    expect(getToken).not.toHaveBeenCalled();
    expect(frame.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "token", token: null }),
      ADMIN_ORIGIN,
    );
  });

  it("rend token=null si non authentifié", async () => {
    authed = false;
    const frame = fakeFrame();
    dispatch(ADMIN_ORIGIN, frame, {
      channel: SUITE_CHANNEL,
      kind: "token-request",
      requestId: "r3",
      audience: "pim",
    });
    await flush();
    expect(getToken).not.toHaveBeenCalled();
    expect(frame.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ token: null }),
      ADMIN_ORIGIN,
    );
  });

  it("reflète la route interne dans l’URL parent", async () => {
    dispatch(ADMIN_ORIGIN, fakeFrame(), {
      channel: SUITE_CHANNEL,
      kind: "route",
      path: "produits/42",
    });
    await flush();
    expect(replaceState).toHaveBeenCalledWith("/b2b-admin/produits/42");
  });

  it("notifyNavigate poste vers la frame établie (après hello)", async () => {
    const frame = fakeFrame();
    dispatch(ADMIN_ORIGIN, frame, { channel: SUITE_CHANNEL, kind: "hello" });
    await flush();
    bridge.notifyNavigate("b2b-admin", "categories");
    expect(frame.postMessage).toHaveBeenCalledWith(
      { channel: SUITE_CHANNEL, kind: "navigate", path: "categories" },
      ADMIN_ORIGIN,
    );
  });

  it("notifyNavigate est un no-op si la frame est inconnue", () => {
    expect(() => bridge.notifyNavigate("b2b-admin", "x")).not.toThrow();
  });
});
