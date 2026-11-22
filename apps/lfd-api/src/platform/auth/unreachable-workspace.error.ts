import { AuthorizationError } from "../shared/errors/app-error.js";

/**
 * L'espace déclaré par l'en-tête (`x-lfc-company`) désigne une société que la
 * personne n'atteint plus — fermée, ou dont elle n'est plus membre (403).
 *
 * Décidé le 2026-11-22 (plan `plan-archiver-un-compte-jamais-servi.md`, § 8) :
 * on refuse plutôt que de retomber en silence sur une autre société ou sur
 * l'espace personnel, ce qui écrivait une commande sous une maison que la
 * personne ne regardait pas.
 */
export class UnreachableWorkspaceError extends AuthorizationError {
  constructor() {
    super(
      "auth.workspace_unreachable",
      "Ce compte n'est plus accessible. Rechargez la page pour choisir un autre espace.",
    );
  }
}
