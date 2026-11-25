# TODO — le départ incomplet et le reliquat

> Relu le 2026-11-25 contre le code. L'état bâti est dans
> [`reliquat.md`](reliquat.md). Un point pris se réduit ici à un renvoi vers
> son plan.

## 1. Avant le déploiement : les requêtes de contrôle

Le second envoi est retiré du code (`reliquat.md` § 8) sans migration. Deux
requêtes, **en lecture seule**, pour Hugo avant le déploiement qui le porte.

**Aucun second envoi n'existe** — trois zéros attendus, sinon le
déploiement attend :

```sql
SELECT
  (SELECT count(*) FROM public.delivery_note WHERE rank > 1) AS bl_reste,
  (SELECT count(*) FROM public.orders WHERE status = 'partially_handed_over') AS en_partie,
  (SELECT count(*) FROM public.order_shortfall_decision WHERE rank > 1) AS decisions_reste;
```

**La file des deux abonnés muets** :

```sql
SELECT subscriber, count(*) FROM platform.outbox_delivery
WHERE subscriber IN ('b2b.delivery-notes.prepare-remainder','b2b.delivery-notes.hand-over-remainder')
  AND delivered_at IS NULL GROUP BY 1;
```

## 2. Retirer les deux abonnés muets

`OnRemainderPacked` (`b2b.delivery-notes.prepare-remainder`) et
`OnRemainderHandedOver` (`b2b.delivery-notes.hand-over-remainder`),
`apps/lfd-api/src/lafoliecoffee/delivery-notes/application/handlers/`,
restent inscrits et rendent la main sans rien faire : sans eux, une
livraison en vol finirait en lettre morte. Ils sortent du code, avec leur
entrée dans `delivery-notes.module.ts`, **une fois que Hugo a constaté leur
file vide** (seconde requête du § 1, lancée après le déploiement). La porte
`durable-cross-block` se relance.

## 3. Le reliquat — ce qui n'est pas fait

- **Une offerte livrée de particulier n'a pas d'écran** : l'écran de
  transformation d'un particulier ne propose que le retrait ; la livraison
  passe par l'API seule.
- **La liste des reliquats n'est pas paginée** (`GET admin/backorders`) : un
  reliquat ouvert n'a pas de limite de durée ; une pagination viendra si la
  liste grandit.
- **Rappel, rien à faire** : le BL d'origine d'ORD-13 (BL-13-1) est
  irrécupérable — réécrit en place avant que les exemplaires du bon soient
  figés, aucun PDF n'en a été rangé.

## 4. Le bon de fidélité

**Ce qui manque.** Une commande qui porte un bon de fidélité ne part jamais
incomplète (`VoucherOrderShortfallError`, « un départ incomplet ne sait pas
encore le répartir »). Le BL partiel ne sait pas où mettre un montant fixe de
bon : sur le BL-1 seul (comme le port d'un reste), ou au prorata. **À
trancher par Hugo**, puis à bâtir dans `departingSourceOf`.

## 5. Le manquant constaté à la porte ou au comptoir (G4, R1, R2)

**Ce qui manque.** Le retrait et la livraison n'ont ni manquant ni réserve à
la remise : `handover/` et `delivery/` lisent le manque du colisage pour
l'afficher (feuille de route, `stop-sheets.ts`), aucun geste n'en déclare un
(relu le 2026-11-10). Ni avoir, ni litige. C'est R1 (réserve par ligne sur le
BL remis) et R2 (l'avoir 381) du plan-cadre
([`../plan-commande-bon-de-livraison-facture.md`](../plan-commande-bon-de-livraison-facture.md),
§ 11.3), reportés par Hugo le 2026-10-24. Argent : `vitruve`.

## 6. Les petits restes

- **Les colonnes mortes du manque sur `orders`** (`shortfall_reported_at`,
  `shortfall_lines`, `shortfall_cleared_at`) : le manque vit dans
  `order_shortfall` depuis LB ; leur resserrement est une migration à part.
- **Les cas de l'aperçu `not_drawn`, `withdrawn`, `sealed`, `counted`,
  `already_authorized`** ne sont éprouvés qu'en unitaire : la scène e2e ne les
  atteint pas au rang 1.
- **Une remise avant le tirage de la liste** n'a pas de fiche à sortir ; si le
  fournil tire ensuite une commande déjà retirée, sa fiche naîtra ouverte.
- **Questions laissées le 2026-10-26, non revérifiées** : faut-il retirer le
  réglage « dépôt autorisé » des adresses côté boutique, que la règle d'arrêt
  ne lit plus ?

## Hors de ce dossier

Les autres chantiers du plan-cadre
([`../plan-commande-bon-de-livraison-facture.md`](../plan-commande-bon-de-livraison-facture.md),
§ 11) : A1 (annuler après l'arrêt) vit dans
[`../annulation/todo-annulation.md`](../annulation/todo-annulation.md), A2
(modifier après l'arrêt) dans [`../modification/`](../modification/modifier-une-commande.md) ;
H2 est ouvert (`draft` et `in_production` sont toujours dans l'énuméré
`OrderStatus`, relu le 2026-11-10) ; H1 n'est pas revérifié ici. E3 (le
retrait par BL) est bâti : [`reliquat.md`](reliquat.md) § 8.
