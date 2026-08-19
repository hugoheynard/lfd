import { FixedClock } from "../../../platform/time/fixed-clock.js";
import { RehearsalTrafficReader } from "../rehearsal-traffic.reader.js";

/**
 * Le double de répétition. Ce qu'on vérifie n'est pas la plausibilité de ses
 * chiffres — c'est qu'il ne puisse **jamais** passer pour du vrai.
 */
describe("RehearsalTrafficReader", () => {
  const at = "2026-08-19T12:00:00.000Z";
  const reader = (): RehearsalTrafficReader =>
    new RehearsalTrafficReader(new FixedClock(new Date(at)));

  it("s'annonce comme une répétition, jusque dans la réponse", async () => {
    // C'est le garde-fou central : un écran branché sur le double ressemble
    // trait pour trait à un écran branché sur la production. Sans cet aveu, on
    // croirait regarder la prod — la panne d'observabilité la plus coûteuse.
    const report = await reader().read(60);

    expect(report.source).toBe("rehearsal");
  });

  it("rend la même chose deux fois de suite", async () => {
    // Un double qui scintille aurait l'air vivant. C'est exactement ce qu'on ne
    // veut pas lui laisser imiter — et ça rend le test de l'écran déterministe.
    const first = await reader().read(60);
    const second = await reader().read(60);

    expect(second).toEqual(first);
  });

  it("borne la fenêtre sur la durée demandée", async () => {
    const report = await reader().read(30);
    const [window] = report.windows;

    expect(window?.to).toBe(at);
    expect(window?.from).toBe("2026-08-19T11:30:00.000Z");
  });

  it("n'est pas tout vert — l'écran doit avoir de quoi s'exercer", async () => {
    const report = await reader().read(60);

    // Un seul nœud depuis que le référentiel EST cette API : la passerelle
    // n'indexe plus qu'elle. Le double suit la carte, sinon il exercerait un
    // écran qui n'existe plus.
    expect(report.windows).toHaveLength(1);
    expect(report.windows.every((window) => window.requests > 0)).toBe(true);
    expect(report.windows.some((window) => window.serverErrors > 0)).toBe(true);
  });

  it("fabrique une histoire AVEC DU RELIEF, sinon la courbe ne prouve rien", async () => {
    // Une courbe plate n'exercerait ni l'échelle, ni le point d'extrémité, ni
    // la lecture qu'on vient lui demander — « est-ce pire que tout à l'heure ».
    const [series] = (await reader().read(60)).series;
    const volumes = series?.points.map((point) => point.requests) ?? [];

    expect(volumes).toHaveLength(48);
    expect(Math.max(...volumes)).toBeGreaterThan(Math.min(...volumes));
    expect(series?.points.some((point) => point.failures > 0)).toBe(true);
  });
});
