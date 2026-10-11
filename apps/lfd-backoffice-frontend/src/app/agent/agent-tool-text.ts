import { HttpErrorResponse } from '@angular/common/http';

import { serverMessageOf } from '../production/server-message';

/** Ce que rend un outil : Angular ne transforme rien, la JSDoc dit « raw string ». */
export type ToolText = string;

/**
 * Rend un refus **lisible**, jamais une exception — partagé par toutes les
 * trousses de l'écran des outils agent.
 *
 * Un outil qui jette casse la boucle de l'agent, qui recommence à l'aveugle. Un
 * outil qui dit « le serveur a refusé, et voici pourquoi » se corrige au coup
 * suivant.
 *
 * Un refus HTTP rend le `message` de l'enveloppe d'erreur de l'API — celui que
 * l'écran montre au personnel — et son statut. Le `message` d'une
 * `HttpErrorResponse` ne dit que « Http failure response for … », c'est-à-dire
 * l'adresse, jamais la règle qui a refusé.
 */
export async function said(what: string, run: () => Promise<string>): Promise<ToolText> {
  try {
    return await run();
  } catch (caught) {
    return `${what} — REFUSÉ : ${refusalOf(caught)}`;
  }
}

function refusalOf(caught: unknown): string {
  if (caught instanceof HttpErrorResponse) {
    return `${caught.status} — ${serverMessageOf(caught)}`;
  }
  return caught instanceof Error ? caught.message : String(caught);
}
