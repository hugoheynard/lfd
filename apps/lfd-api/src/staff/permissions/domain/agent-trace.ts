/**
 * **La trace d'un geste d'outil agent** dans une charge de fait (plan
 * `documentation/droits-et-permissions/plan-outils-agent-droits.md`).
 *
 * `via.agentTool` nomme l'outil WebMCP qui a écrit, lu dans l'en-tête
 * `x-lfd-agent-tool`. Une TRACE et non une preuve : l'en-tête vient du
 * navigateur, et rien ne décide d'un accès sur lui.
 */
export interface AgentTrace {
  readonly via?: { readonly agentTool: string };
}

/** La clé `via` à fondre dans une charge — rien quand le geste vient de l'écran. */
export function viaAgent(agentTool: string | null): AgentTrace {
  return agentTool === null ? {} : { via: { agentTool } };
}
