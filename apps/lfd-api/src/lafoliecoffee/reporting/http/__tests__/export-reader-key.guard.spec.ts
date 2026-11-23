import { type ExecutionContext, UnauthorizedException } from "@nestjs/common";

import type { Actor } from "../../../../platform/context/request-context.js";
import {
  currentRequestContext,
  runWithRequestContext,
} from "../../../../platform/context/request-context.store.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { MemoryExportReaderKeys } from "../../application/commands/__tests__/export-reader-key.doubles.js";
import { ExportReaderAdmission } from "../../application/services/export-reader-admission.js";
import { ExportReaderKey } from "../../domain/entities/export-reader-key.js";
import { ExportReaderKeyGuard } from "../export-reader-key.guard.js";

/** L'horloge est doublée : les dates ne se comparent qu'à elle. */
const NOW = new Date("2026-11-23T09:00:00.000Z");
const LATER = new Date("2026-12-23T09:00:00.000Z");
const SECRET = "la-clé-de-la-direction-".padEnd(43, "x");
const ADMITTED_IP = "203.0.113.7";

type Headers = Record<string, string | string[] | undefined>;

/** Un contexte Nest réduit à ses en-têtes. */
function contextWith(headers: Headers): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as ExecutionContext;
}

async function scene(options: { allowedIps?: string[]; revoked?: boolean } = {}) {
  const keys = new MemoryExportReaderKeys();
  const key = ExportReaderKey.issue({
    id: "key_1",
    label: "Direction",
    secret: SECRET,
    at: new Date(NOW.getTime() - 1_000),
    byStaffId: "staff_1",
    expiresAt: LATER,
    allowedIps: options.allowedIps ?? [],
  });
  if (options.revoked === true) {
    key.revoke(NOW, "staff_2");
  }
  await keys.save(key);
  const clock = new FixedClock(NOW);
  const guard = new ExportReaderKeyGuard(new ExportReaderAdmission(keys.lookup(), clock));
  return { guard, clock, keys };
}

/** Passe la garde dans un contexte de requête, et rend l'acteur qu'elle y a posé. */
async function actorAfter(guard: ExportReaderKeyGuard, headers: Headers): Promise<Actor | null> {
  return runWithRequestContext({ now: NOW, traceId: "trace" }, async () => {
    await guard.canActivate(contextWith(headers));
    return currentRequestContext()?.actor ?? null;
  });
}

describe("ExportReaderKeyGuard", () => {
  it("admet la bonne clé et pose l'acteur system export-reader:<id>", async () => {
    const { guard } = await scene();

    await expect(actorAfter(guard, { "x-export-key": ` ${SECRET} ` })).resolves.toEqual({
      type: "system",
      id: "export-reader:key_1",
    });
  });

  it("refuse un appel sans en-tête", async () => {
    const { guard } = await scene();

    await expect(guard.canActivate(contextWith({}))).rejects.toThrow(UnauthorizedException);
  });

  it("ignore une clé passée en Authorization: Bearer", async () => {
    const { guard } = await scene();

    await expect(
      guard.canActivate(contextWith({ authorization: `Bearer ${SECRET}` })),
    ).rejects.toThrow(/X-Export-Key/u);
  });

  it("refuse une clé inconnue, avec le même message qu'une clé révoquée", async () => {
    const unknown = await scene();
    const revoked = await scene({ revoked: true });

    const unknownError = await unknown.guard
      .canActivate(contextWith({ "x-export-key": "autre".padEnd(43, "y") }))
      .catch((error: unknown) => error);
    const revokedError = await revoked.guard
      .canActivate(contextWith({ "x-export-key": SECRET }))
      .catch((error: unknown) => error);

    expect(unknownError).toBeInstanceOf(UnauthorizedException);
    expect(revokedError).toBeInstanceOf(UnauthorizedException);
    expect((revokedError as UnauthorizedException).message).toBe(
      (unknownError as UnauthorizedException).message,
    );
  });

  it("refuse une clé échue", async () => {
    const { guard, clock } = await scene();
    clock.set(LATER);

    await expect(guard.canActivate(contextWith({ "x-export-key": SECRET }))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it("refuse une adresse non admise, admet l'adresse lue sur x-lfc-client-ip", async () => {
    const { guard } = await scene({ allowedIps: [ADMITTED_IP] });

    await expect(
      guard.canActivate(contextWith({ "x-export-key": SECRET, "x-lfc-client-ip": "198.51.100.4" })),
    ).rejects.toThrow(UnauthorizedException);
    await expect(
      guard.canActivate(contextWith({ "x-export-key": SECRET, "x-lfc-client-ip": ADMITTED_IP })),
    ).resolves.toBe(true);
  });

  it("n'écrit rien : la clé n'est pas rangée à nouveau", async () => {
    const { guard, keys } = await scene();

    await guard.canActivate(contextWith({ "x-export-key": SECRET }));

    expect(keys.saved).toHaveLength(1);
  });

  it("un refus ne pose aucun acteur", async () => {
    const { guard } = await scene();

    const actor = await runWithRequestContext({ now: NOW, traceId: "trace" }, async () => {
      await guard.canActivate(contextWith({ "x-export-key": "faux" })).catch(() => undefined);
      return currentRequestContext()?.actor ?? null;
    });

    expect(actor).toEqual({ type: "system", id: null });
  });
});
