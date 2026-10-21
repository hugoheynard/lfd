import type { ResupplyTarget, SiteResuppliesView } from "@lfd/contracts";
import type request from "supertest";

import { jsonBody } from "./e2e-harness.js";

/**
 * Le geste du comptoir pour envoyer un réassort, par ses vraies routes (lot
 * R1c) : chaque ligne s'ajoute à la demande en cours de la visée, puis la
 * demande part sous la version relue. Le `POST` d'un seul tenant qu'on
 * employait avant est retiré au lot R1d (2026-10-21).
 */
export async function counterSends(
  agent: request.Agent,
  siteId: string,
  target: ResupplyTarget,
  lines: readonly { readonly sku: string; readonly quantity: number }[],
): Promise<{ readonly id: string; readonly sent: request.Response }> {
  let id = "";
  for (const line of lines) {
    const added = await agent
      .post(`/admin/site-resupplies/sites/${siteId}/drafts/${target}/lines`)
      .send(line)
      .expect(201);
    id = jsonBody<{ id: string }>(added).id;
  }
  const view = jsonBody<SiteResuppliesView>(
    await agent.get(`/admin/site-resupplies/sites/${siteId}`).expect(200),
  );
  const version = view.drafts.find((draft) => draft.id === id)?.version ?? 0;
  const sent = await agent
    .post(`/admin/site-resupplies/sites/${siteId}/${id}/send`)
    .send({ version });
  return { id, sent };
}

/** Le même geste, attendu réussi ; rend l'identifiant du réassort envoyé. */
export async function counterSent(
  agent: request.Agent,
  siteId: string,
  target: ResupplyTarget,
  lines: readonly { readonly sku: string; readonly quantity: number }[],
): Promise<string> {
  const { id, sent } = await counterSends(agent, siteId, target, lines);
  if (sent.status !== 204) {
    throw new Error(`L'envoi du réassort a répondu ${String(sent.status)} au lieu de 204.`);
  }
  return id;
}
