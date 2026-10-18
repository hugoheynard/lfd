import { declareExperimentalWebMcpTool } from '@angular/core';
import {
  STAFF_SUGGESTION_PLACEMENTS,
  STAFF_SUGGESTION_READERS,
  type StaffSuggestionChoicesView,
  type StaffSuggestionPlacement,
  type StaffSuggestionPreviewView,
  type StaffSuggestionReader,
  type StaffSuggestionRuleView,
} from '@lfd/contracts';

import type { StaffSuggestionsService } from '../suggestions/staff-suggestions.service';
import {
  boughtWithTitle,
  defaultCardTitle,
  previewPayload,
  previewPrice,
  previewReason,
  type ReasonContext,
} from '../suggestions/suggestion-preview';

import { centsField } from '../comptabilite/cents-field';

import { said } from './agent-tool-text';

/** Ce que l'outil reçoit — les entrées de l'aperçu de l'écran. */
interface PreviewArgs {
  readonly placement: StaffSuggestionPlacement;
  readonly cartSkus?: readonly string[] | undefined;
  readonly viewedSku?: string | undefined;
  readonly audience: StaffSuggestionReader;
  readonly day: string;
  readonly time?: string | undefined;
  readonly cartTotalCents?: number | undefined;
  readonly pickupAddressId?: string | undefined;
}

/**
 * **`suggestion_preview`** (RS5) — l'aperçu de l'écran Suggestions, sans le
 * clic : la carte que verrait le client, puis chaque règle non archivée avec
 * « affichée » ou sa raison. Même route que l'écran
 * (`POST admin/suggestions/preview`, sous `lfc_suggestions:read`).
 */
export function declareSuggestionPreviewTool(
  api: StaffSuggestionsService,
  choices: () => Promise<StaffSuggestionChoicesView | null>,
): void {
  void declareExperimentalWebMcpTool({
    name: 'suggestion_preview',
    description:
      'Aperçu des suggestions décidées, comme le bloc « Aperçu » de l’écran : pour un emplacement (`placement` : cart, avec `cartSkus` les SKU au panier ; ou product, avec `viewedSku` l’article de la fiche et `cartSkus` facultatif ; ou home, l’accueil, où seul « partout » vaut et `cartSkus` écarte ce qui est déjà au panier), une clientèle (`audience` : public ou pro) et un jour (`day` AAAA-MM-JJ) — et, pour les conditions, l’heure (`time` HH:MM, Paris ; omise = maintenant), le total du panier (`cartTotalCents`, centimes ; omis = pas encore chiffré) et le point de retrait (`pickupAddressId` ; omis = pas encore choisi) —, rend la carte EXACTE que verrait le client (titre, articles, prix HT pour pro, TTC pour particulier ; aux pros, la vitrine sans tarif de société), puis CHAQUE règle non archivée avec « Affichée » ou la raison (finie, pas commencée, coupée, clientèle, emplacement, jour de la semaine, heure, point de retrait pas encore choisi ou autre, panier sous le seuil ou contenant la famille exclue, déclencheur faux, article non servi / non commandable ce jour-là / déjà au panier / article de la fiche, battue par une autre). Lecture seule.',
    inputSchema: {
      type: 'object',
      properties: {
        placement: { type: 'string', enum: STAFF_SUGGESTION_PLACEMENTS },
        cartSkus: { type: 'array', items: { type: 'string' } },
        viewedSku: { type: 'string' },
        audience: { type: 'string', enum: STAFF_SUGGESTION_READERS },
        day: { type: 'string' },
        time: { type: 'string' },
        cartTotalCents: { type: 'integer' },
        pickupAddressId: { type: 'string' },
      },
      required: ['placement', 'audience', 'day'],
      additionalProperties: false,
    },
    execute: (args) =>
      said('Aperçu des suggestions', async () => {
        const payload = previewPayload({
          placement: args.placement,
          cart: args.cartSkus ?? [],
          viewedSku: args.viewedSku ?? null,
          audience: args.audience,
          day: args.day,
          time: args.time ?? '',
          cartTotal: args.cartTotalCents === undefined ? '' : centsField(args.cartTotalCents),
          siteId: args.pickupAddressId ?? null,
        });
        if (payload === null) {
          return 'Aperçu des suggestions — REFUSÉ : sur une fiche, `viewedSku` (le SKU de la fiche) est obligatoire.';
        }
        const [view, rules, known, order] = await Promise.all([
          api.preview(payload),
          api.list(),
          choices(),
          api.order().then(
            (read) => read.order,
            () => null,
          ),
        ]);
        return previewText(view, args, { choices: known, rules: byId(rules), order });
      }),
  });
}

function byId(
  rules: readonly StaffSuggestionRuleView[],
): ReadonlyMap<string, StaffSuggestionRuleView> {
  return new Map(rules.map((rule) => [rule.id, rule]));
}

/** L'aperçu en texte : la carte, puis une ligne par règle. */
export function previewText(
  view: StaffSuggestionPreviewView,
  args: Pick<PreviewArgs, 'placement' | 'audience'>,
  ctx: ReasonContext,
): string {
  const staff = view.shown.flatMap((shown) =>
    shown.reason.source === 'staff' ? [{ item: shown.item, phrase: shown.reason.phrase }] : [],
  );
  const first = staff[0];
  const card =
    first === undefined
      ? `Le ${view.day}, le client ne verrait aucune suggestion décidée.`
      : `Le ${view.day}, le client verrait « ${first.phrase?.fr ?? defaultCardTitle(args.placement)} » : ${staff
          .map(({ item }) => `${item.name} [${item.sku}] ${previewPrice(item, args.audience)}`)
          .join(' ; ')}.`;
  const computed = view.shown.flatMap(({ item, reason }) =>
    reason.source === 'data'
      ? [
          `Puis, calculée : « ${boughtWithTitle(reason.withName)} » : ${item.name} [${item.sku}] ${previewPrice(item, args.audience)}.`,
        ]
      : [],
  );
  const lines = view.rules.flatMap((row) => {
    const rule = ctx.rules.get(row.ruleId);
    if (rule === undefined) {
      return [];
    }
    const items =
      row.items.length > 1
        ? ` (${row.items.map((item) => `${item.sku} : ${previewReason(rule, item, ctx, item.sku)}`).join(' ; ')})`
        : '';
    return [`id ${row.ruleId} [${row.status}] — ${previewReason(rule, row, ctx)}${items}`];
  });
  return [
    card,
    ...computed,
    lines.length === 0 ? 'Aucune suggestion en cours.' : lines.join('\n'),
  ].join('\n');
}
