/**
 * Les fixtures partagées par les deux suites e2e des **notes du commercial** :
 * le parcours et ses refus (`client-notes.e2e-spec.ts`), le mur, les permissions
 * et le journal (`client-notes-wall.e2e-spec.ts`).
 *
 * Rien ici ne boote l'application : des octets d'image, les gestes HTTP d'un
 * agent, la lecture du bucket, et le semis d'un agent d'un rôle donné. Chaque
 * suite garde son propre `bootstrapE2e`.
 */
import type { ClientNotebookView, CreatedClientNoteResponse, StaffRole } from "@lfd/contracts";
import type request from "supertest";

import { pngOf } from "./delivery-procedure-scene.js";
import { jsonBody, type E2eContext } from "./e2e-harness.js";
import { storageKeys } from "./storage.js";

/** Staff doublé : le jeton porteur EST le `sub`. */
export const tokenIsSubject = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

export const PHOTO = pngOf(2400, 1800);
export const THUMBNAIL = pngOf(320, 240);
export const OTHER_PHOTO = pngOf(1800, 2400);
export const OTHER_THUMBNAIL = pngOf(240, 320);

/** Le texte d'une note, qu'aucun fait ne doit recopier. */
export const SECRET_TITLE = "Visite — code portail 4821";
export const SECRET_BODY = "Le gérant veut 30 brioches le mardi";

export const FACT = "company.client_note_edited_by_staff";

/** Le chemin du carnet d'une société. */
export function notesOf(companyId: string): string {
  return `/admin/companies/${companyId}/notes`;
}

/** Ajoute une note en multipart, avec sa paire photo + vignette si fournie ; rend son id. */
export async function addNote(
  agent: request.Agent,
  companyId: string,
  title: string,
  pair: readonly [Buffer, Buffer] | null,
): Promise<string> {
  const pending = agent.post(notesOf(companyId)).field("title", title).field("body", SECRET_BODY);
  const response = await (
    pair === null
      ? pending
      : pending.attach("photo", pair[0], "note.png").attach("thumbnail", pair[1], "vignette.png")
  ).expect(201);
  return jsonBody<CreatedClientNoteResponse>(response).id;
}

/** Le carnet d'une société, lu avec succès. */
export async function readNotebook(
  agent: request.Agent,
  companyId: string,
): Promise<ClientNotebookView> {
  return jsonBody<ClientNotebookView>(await agent.get(notesOf(companyId)).expect(200));
}

/** Les objets du bucket des pièces rangés sous le carnet de la société. */
export async function storedImages(companyId: string): Promise<string[]> {
  return (await storageKeys()).filter((key) =>
    key.startsWith(`companies/${companyId}/client-notes/`),
  );
}

/** Sème une personne de ce rôle, déjà entrée, et rend son agent HTTP. */
export async function asRole(ctx: E2eContext, role: StaffRole): Promise<request.Agent> {
  const sub = `staff-notes-${role}`;
  await ctx.prisma.staffUser.create({
    data: {
      firstName: "Test",
      lastName: role,
      email: `notes-${role}@lfc.test`,
      role,
      status: "active",
      auth0Id: sub,
    },
  });
  return ctx.asSub(sub);
}
