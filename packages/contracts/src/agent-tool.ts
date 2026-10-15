/**
 * **L'en-tête qui marque un geste d'outil agent** (plan
 * `documentation/droits-et-permissions/plan-outils-agent-droits.md`).
 *
 * Un outil WebMCP du back-office le pose avec son nom ; une route qui écrit
 * des droits le lit et le range dans son fait de journal (`via.agentTool`).
 *
 * 🔴 C'est une **trace, pas une porte** : il vient du navigateur, donc il se
 * falsifie — un agent ou une personne peut l'omettre ou le poser à tort.
 * Aucune décision d'accès ne le lit.
 */
export const AGENT_TOOL_HEADER = "x-lfd-agent-tool";

/** La forme d'un nom d'outil : `role_grant`, `staff_assign_role`… */
const AGENT_TOOL_NAME = /^[a-z][a-z0-9_]{0,63}$/u;

/**
 * Le nom d'outil d'un en-tête reçu, ou `null` s'il manque ou n'a pas la forme
 * d'un nom d'outil — une valeur libre n'entre pas dans le journal.
 */
export function agentToolOf(raw: string | readonly string[] | undefined): string | null {
  const value = typeof raw === "string" ? raw.trim() : null;
  return value !== null && AGENT_TOOL_NAME.test(value) ? value : null;
}
