# Les webhooks

> Dossier ouvert le 2026-10-18 (Hugo : « rassemble tout ce qui peut concerner
> ça dans documentation/webhooks »). Il regroupe les webhooks **sortants** que
> nous émettons — le premier est celui de la vitrine — et recense, pour
> mémoire, les webhooks **entrants** que nous recevons déjà.

## Sortants — ce que nous envoyons

| Webhook             | À qui                                 | État                                                                                    | Doc                        |
| ------------------- | ------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------- |
| **Vitrine** (lot W) | l'agence web qui fait le site vitrine | ✅ implémenté (2026-10-18, restes finis le 2026-10-19) — reste la recette avec l'agence | [`vitrine.md`](vitrine.md) |

Le principe retenu : **notifier, puis laisser relire**. Le webhook ne porte
qu'un signal (ce qui a changé) ; le contenu se relit par des routes que nous
servons (`/vitrine/*`), filtrées par abonné, à partir de la vue **publique** de
la boutique — jamais un prix pro, un client ou un article réservé aux pros.

## Entrants — ce que nous recevons déjà

| Webhook              | De qui | Route                    | Code                                                                    | Doc                                                                                                                                    |
| -------------------- | ------ | ------------------------ | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Paiements            | Stripe | `POST /payments/webhook` | `apps/lfd-api/src/b2b/payments/http/payments-webhook.controller.ts`     | [`../ops/secrets-et-variables.md`](../ops/secrets-et-variables.md) (`STRIPE_WEBHOOK_SECRET`), [`../ops/runbook.md`](../ops/runbook.md) |
| Courriels (rebonds…) | Resend | `POST /webhooks/resend`  | `apps/lfd-api/src/platform/mailer/webhook/resend-webhook.controller.ts` | [`../ops/runbook.md`](../ops/runbook.md)                                                                                               |

Ils ne bougent pas : ils sont listés ici pour qu'un webhook sortant ne
réinvente pas ce qu'ils savent déjà faire (vérifier une signature, refuser un
rejeu, journaliser un échec).
