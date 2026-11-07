/**
 * Query : les phrases d'un e-mail et leurs variantes, sous `mail_templates`
 * (plan `plan-editeur-par-blocs.md`, § 16, S4d) — ce que l'éditeur relit
 * après avoir écrit une phrase, sans recharger le document.
 */
export class GetMailTemplatePhrasesQuery {
  constructor(readonly template: string) {}
}
