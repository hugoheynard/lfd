import {
  formatServerTiming,
  noteServerTiming,
  recordServerTiming,
  serverTiming,
  timeServerTiming,
  timeServerTimingSpan,
  type TimedRequest,
} from "../server-timing.js";

describe("serverTiming", () => {
  it("pose les étapes du guard puis le temps de Nest au moment d'écrire l'en-tête", () => {
    const headers = new Map<string, string>();
    const written: unknown[][] = [];
    const response = {
      setHeader: (name: string, value: string) => headers.set(name, value),
      writeHead: (...args: never[]) => written.push(args),
    };
    const request: TimedRequest = {};
    let nextCalled = false;
    serverTiming(request, response, () => {
      nextCalled = true;
    });
    recordServerTiming(request, "principal", performance.now());
    (response.writeHead as (...args: unknown[]) => unknown)(200);

    expect(nextCalled).toBe(true);
    expect(written).toEqual([[200]]);
    expect(headers.get("Server-Timing")).toMatch(/^principal;dur=\d+\.\d, app;dur=\d+\.\d$/);
  });

  it("n'ajoute rien à une requête qui n'est pas chronométrée", () => {
    const request: TimedRequest = {};
    recordServerTiming(request, "auth", 0);
    expect(request.serverTiming).toBeUndefined();
  });

  it("écrit chaque durée avec une décimale", () => {
    expect(formatServerTiming([{ name: "auth", durationMs: 3.14159 }])).toBe("auth;dur=3.1");
  });
});

describe("marques posées hors du guard (2026-11-05)", () => {
  function timed(work: () => Promise<void>): Promise<string | undefined> {
    const headers = new Map<string, string>();
    const response = {
      setHeader: (name: string, value: string) => headers.set(name, value),
      writeHead: (..._args: never[]) => undefined,
    };
    return new Promise((resolve, reject) => {
      serverTiming({}, response, () => {
        work()
          .then(() => {
            (response.writeHead as (...args: unknown[]) => unknown)(200);
            resolve(headers.get("Server-Timing"));
          })
          .catch(reject);
      });
    });
  }

  it("une étape chronométrée et une description rejoignent l'en-tête de LEUR requête", async () => {
    const header = await timed(async () => {
      await timeServerTiming("stamp", () => Promise.resolve(1n));
      noteServerTiming("principal-source", "memory");
    });
    expect(header).toMatch(
      /^stamp;dur=\d+\.\d, principal-source;dur=0\.0;desc="memory", app;dur=\d+\.\d$/,
    );
  });

  it("hors requête, ne note rien et rend le résultat", async () => {
    await expect(timeServerTiming("stamp", () => Promise.resolve(7))).resolves.toBe(7);
    expect(() => noteServerTiming("principal-source", "memory")).not.toThrow();
  });

  it("formate une description entre guillemets", () => {
    expect(formatServerTiming([{ name: "p", durationMs: 0, description: "resolved-stamp" }])).toBe(
      'p;dur=0.0;desc="resolved-stamp"',
    );
  });

  it("une famille de lectures parallèles rend sa durée murale et son nombre", async () => {
    const wait = (ms: number) => new Promise<number>((done) => setTimeout(() => done(ms), ms));
    const header = await timed(async () => {
      await Promise.all([
        timeServerTimingSpan("catalogue", () => wait(20)),
        timeServerTimingSpan("catalogue", () => wait(20)),
      ]);
      await timeServerTimingSpan("catalogue", () => wait(1));
    });
    expect(header).toMatch(
      /^catalogue;dur=(\d+\.\d), catalogue-reads;dur=0\.0;desc="3", app;dur=\d+\.\d$/,
    );
    // L'union elle-même est éprouvée sans horloge (`overlapping-span.spec.ts`).
  });

  it("une lecture qui échoue est comptée et l'erreur remonte", async () => {
    const header = await timed(async () => {
      await expect(
        timeServerTimingSpan("catalogue", () => Promise.reject(new RangeError("refus"))),
      ).rejects.toThrow("refus");
    });
    expect(header).toContain('catalogue-reads;dur=0.0;desc="1"');
  });

  it("une requête sans lecture du catalogue ne porte pas la marque", async () => {
    const header = await timed(() => Promise.resolve());
    expect(header).toMatch(/^app;dur=\d+\.\d$/);
  });

  it("hors requête, une lecture chronométrée ne note rien et rend son résultat", async () => {
    await expect(timeServerTimingSpan("catalogue", () => Promise.resolve(9))).resolves.toBe(9);
  });
});
