import { declareExperimentalWebMcpTool, inject } from '@angular/core';
import {
  STAFF_SUGGESTION_AUDIENCES,
  STAFF_SUGGESTION_ORDERS,
  STAFF_SUGGESTION_PLACEMENTS,
  STAFF_SUGGESTION_TRIGGERS,
  type StaffSuggestionChoicesView,
  type StaffSuggestionRulePayload,
  type StaffSuggestionRuleView,
} from '@lfd/contracts';

import { StaffSuggestionsService } from '../suggestions/staff-suggestions.service';

import { said } from './agent-tool-text';
import { declareSuggestionPreviewTool } from './suggestion-preview-agent-tool';
import { declareSuggestionResultsTool } from './suggestion-results-agent-tool';
import { orderText, suggestionText } from './suggestion-agent-text';

/** Les outils de lecture — déclarés avec `lfc_suggestions:read`. */
export const SUGGESTION_READ_TOOLS = [
  'suggestion_list',
  'suggestion_order_get',
  'suggestion_preview',
  'suggestion_results',
] as const;
/** Les outils d'écriture — déclarés en plus avec `lfc_suggestions:write`. */
export const SUGGESTION_WRITE_TOOLS = [
  'suggestion_create',
  'suggestion_update',
  'suggestion_set_active',
  'suggestion_archive',
  'suggestion_order_set',
] as const;

/** Les champs d'une règle, mot pour mot ceux du contrat (`staffSuggestionRulePayloadSchema`). */
const RULE_FIELDS = {
  triggerKind: { type: 'string', enum: STAFF_SUGGESTION_TRIGGERS },
  triggerRef: { type: 'string' },
  suggestedSkus: { type: 'array', items: { type: 'string' } },
  placement: { type: 'string', enum: STAFF_SUGGESTION_PLACEMENTS },
  audience: { type: 'string', enum: STAFF_SUGGESTION_AUDIENCES },
  startsOn: { type: 'string' },
  endsOn: { type: 'string' },
  phraseFr: { type: 'string' },
  phraseEn: { type: 'string' },
  phraseIt: { type: 'string' },
  priority: { type: 'integer' },
} as const;

const FIELDS_HELP =
  '`triggerKind` : everywhere (partout, sans triggerRef), product_in_cart ou product_viewed (triggerRef = SKU), category_in_cart (triggerRef = id de famille). `suggestedSkus` : 1 à 3 SKU distincts, jamais celui qui déclenche. `placement` : home, cart ou product — product_in_cart et category_in_cart seulement au panier (cart), product_viewed seulement en fiche (product), everywhere partout. `audience` : pro, public ou both. `startsOn` et `endsOn` : jours AAAA-MM-JJ, compris, fin ≥ début, fin pas déjà passée à la création. `phraseFr` (90 caractères au plus ; vide = « Notre conseil »), `phraseEn`, `phraseIt` facultatives, jamais sans français. `priority` : entier de 0 à 999, lu quand l’ordre est « priority ». Les SKU et familles se lisent par suggestion_list (catalogue servi en fin de réponse).';

/** Ce qu'un outil reçoit pour une règle — tous facultatifs à la correction. */
interface RuleFields {
  readonly triggerKind?: StaffSuggestionRulePayload['trigger']['kind'] | undefined;
  readonly triggerRef?: string | undefined;
  readonly suggestedSkus?: readonly string[] | undefined;
  readonly placement?: StaffSuggestionRulePayload['placement'] | undefined;
  readonly audience?: StaffSuggestionRulePayload['audience'] | undefined;
  readonly startsOn?: string | undefined;
  readonly endsOn?: string | undefined;
  readonly phraseFr?: string | undefined;
  readonly phraseEn?: string | undefined;
  readonly phraseIt?: string | undefined;
  readonly priority?: number | undefined;
}

/**
 * **Les outils WebMCP des suggestions décidées** (2026-10-18, RS1) —
 * Gestion Boutique › Suggestions, sans le clic.
 *
 * Chaque outil vise la route de l'écran par {@link StaffSuggestionsService} :
 * même mur (`@AdminSurface("lfc_suggestions")`), mêmes refus de l'agrégat
 * (déclencheur suggéré, emplacement incohérent, fin passée, article hors du
 * catalogue servi…), rendus par {@link said} avec le message du serveur.
 * Chaque écriture rend la règle RELUE.
 */
export function declareSuggestionAgentTools(canWrite: boolean): readonly string[] {
  const api = inject(StaffSuggestionsService);

  /** Le catalogue nomme les articles ; sa panne ne cache pas les règles. */
  async function choices(): Promise<StaffSuggestionChoicesView | null> {
    try {
      return await api.choices();
    } catch {
      return null;
    }
  }

  async function reread(id: string): Promise<string> {
    const [rules, known] = await Promise.all([api.list(), choices()]);
    const rule = rules.find((candidate) => candidate.id === id);
    return rule === undefined ? `id ${id} (relecture : introuvable)` : suggestionText(rule, known);
  }

  async function current(id: string): Promise<StaffSuggestionRuleView | null> {
    return (await api.list()).find((rule) => rule.id === id) ?? null;
  }

  void declareExperimentalWebMcpTool({
    name: 'suggestion_list',
    description:
      'Les suggestions décidées par l’équipe (« quand le client fait ceci, montre-lui cela ») : chacune avec son id, son état (active, coupée, archivée), sa phrase, son déclencheur, les articles montrés, l’emplacement, l’audience, la période et la priorité ; puis le catalogue servi (SKU, nom) et ses familles (id, nom), où se choisissent les références. Lecture seule.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    execute: () =>
      said('Lecture des suggestions', async () => {
        const [rules, known] = await Promise.all([api.list(), choices()]);
        const lines = rules.map((rule) => suggestionText(rule, known));
        const catalogue =
          known === null
            ? 'Catalogue servi : illisible pour l’instant.'
            : `Catalogue servi : ${known.articles.map((article) => `${article.sku} ${article.name}`).join(' ; ')}\nFamilles : ${known.families.map((family) => `${family.id} ${family.name}`).join(' ; ')}`;
        return [
          lines.length === 0 ? 'Aucune suggestion décidée.' : lines.join('\n'),
          catalogue,
        ].join('\n');
      }),
  });

  void declareExperimentalWebMcpTool({
    name: 'suggestion_order_get',
    description:
      'L’ordre appliqué quand plusieurs suggestions s’appliquent au même endroit : « recent » (la plus récente d’abord) ou « priority » (la priorité la plus haute, puis la plus récente). Lecture seule.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    execute: () => said('Lecture de l’ordre', async () => orderText(await api.order())),
  });

  declareSuggestionPreviewTool(api, choices);
  declareSuggestionResultsTool(api);

  if (!canWrite) {
    return SUGGESTION_READ_TOOLS;
  }

  void declareExperimentalWebMcpTool({
    name: 'suggestion_create',
    description: `Crée une suggestion décidée, comme « Nouvelle suggestion » à l'écran ; elle naît active. ${FIELDS_HELP} Rend la règle créée.`,
    inputSchema: {
      type: 'object',
      properties: RULE_FIELDS,
      required: ['triggerKind', 'suggestedSkus', 'placement', 'audience', 'startsOn', 'endsOn'],
      additionalProperties: false,
    },
    execute: (args) =>
      said('Création de la suggestion', async () => {
        const created = await api.create(payloadOf(args, null));
        return `CRÉÉE — ${await reread(created.id)}`;
      }),
  });

  void declareExperimentalWebMcpTool({
    name: 'suggestion_update',
    description: `Réécrit une suggestion par son \`id\` (suggestion_list), comme « Modifier » à l'écran. Un champ OMIS GARDE sa valeur ; une phrase se vide en donnant \`phraseFr\` vide. ${FIELDS_HELP} Une archivée ne se modifie plus. Rend la règle relue.`,
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, ...RULE_FIELDS },
      required: ['id'],
      additionalProperties: false,
    },
    execute: (args) =>
      said('Correction de la suggestion', async () => {
        const rule = await current(args.id);
        if (rule === null) {
          return `Correction de la suggestion — REFUSÉ : aucune suggestion n'a l'id ${args.id}. Relire par suggestion_list.`;
        }
        await api.revise(rule.id, payloadOf(args, rule));
        return `CORRIGÉE — ${await reread(rule.id)}`;
      }),
  });

  void declareExperimentalWebMcpTool({
    name: 'suggestion_set_active',
    description:
      'Coupe (`active: false`) ou rallume (`active: true`) une suggestion par son `id`, sans rien supprimer. Rend la règle relue.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, active: { type: 'boolean' } },
      required: ['id', 'active'],
      additionalProperties: false,
    },
    execute: (args) =>
      said(args.active ? 'Rallumage' : 'Coupure', async () => {
        await api.setActive(args.id, args.active);
        return `${args.active ? 'RALLUMÉE' : 'COUPÉE'} — ${await reread(args.id)}`;
      }),
  });

  void declareExperimentalWebMcpTool({
    name: 'suggestion_archive',
    description:
      'Archive une suggestion par son `id` : retirée pour toujours, jamais supprimée, et elle ne se modifie plus. Préférer suggestion_set_active pour une pause. Rend la règle relue.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
    execute: (args) =>
      said('Archivage', async () => {
        await api.archive(args.id);
        return `ARCHIVÉE — ${await reread(args.id)}`;
      }),
  });

  void declareExperimentalWebMcpTool({
    name: 'suggestion_order_set',
    description:
      'Règle l’ordre entre suggestions concurrentes : « recent » (la plus récente d’abord) ou « priority » (la priorité, puis la plus récente). Journalisé. Rend l’ordre relu.',
    inputSchema: {
      type: 'object',
      properties: { order: { type: 'string', enum: STAFF_SUGGESTION_ORDERS } },
      required: ['order'],
      additionalProperties: false,
    },
    execute: (args) =>
      said('Réglage de l’ordre', async () => {
        await api.setOrder(args.order);
        return `RÉGLÉ — ${orderText(await api.order())}`;
      }),
  });

  return [...SUGGESTION_READ_TOOLS, ...SUGGESTION_WRITE_TOOLS];
}

/**
 * La règle ENTIÈRE à envoyer : `PUT` remplace tout. On part de la règle lue
 * (ou de rien à la création), on pose ce qui est donné. Rien n'est jugé ici :
 * le serveur refuse ce qu'il doit, et le dit.
 */
export function payloadOf(
  given: RuleFields,
  rule: StaffSuggestionRuleView | null,
): StaffSuggestionRulePayload {
  const kind = given.triggerKind ?? rule?.trigger.kind ?? 'everywhere';
  const ref = given.triggerRef ?? (kind === rule?.trigger.kind ? rule.trigger.ref : null);
  const fr = given.phraseFr ?? rule?.phrase?.fr ?? '';
  const en = given.phraseEn ?? rule?.phrase?.en ?? '';
  const it = given.phraseIt ?? rule?.phrase?.it ?? '';
  return {
    trigger: { kind, ref: kind === 'everywhere' ? null : (ref ?? '') },
    suggestedSkus: [...(given.suggestedSkus ?? rule?.suggestedSkus ?? [])],
    placement: given.placement ?? rule?.placement ?? 'home',
    audience: given.audience ?? rule?.audience ?? 'both',
    startsOn: given.startsOn ?? rule?.startsOn ?? '',
    endsOn: given.endsOn ?? rule?.endsOn ?? '',
    phrase:
      fr.trim() === '' && en.trim() === '' && it.trim() === ''
        ? null
        : { fr, ...(en === '' ? {} : { en }), ...(it === '' ? {} : { it }) },
    priority: given.priority ?? rule?.priority ?? 0,
  };
}
