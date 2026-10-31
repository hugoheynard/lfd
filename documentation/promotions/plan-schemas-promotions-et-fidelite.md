# Plan — les promotions et la fidélité ont chacune leur schéma

> ⏸️ **Suspendu le 2026-10-31**, après la contradiction de `vitruve` (§ 5) : le
> déplacement serait cosmétique tant que la propriété des tables n'est pas
> tenue par contexte — noté dans
> [`../todos/todo-propriete-des-tables-par-contexte.md`](../todos/todo-propriete-des-tables-par-contexte.md).
> Rien n'est bâti.

## 1. Pourquoi (dit à Hugo le 2026-10-31)

1. **Interdire plutôt que surveiller** : `lint:cross-schema-join` refuse toute
   requête qui joint deux schémas, et `lint:prisma-model-ownership` ne
   raisonne que par **bloc** (`dev-toolbox/gates/prisma-model-ownership.mjs`,
   `BLOCKS`) — à l'intérieur de `b2b/`, un contexte peut lire les tables d'un
   autre. Dans leur schéma, les tables des promotions et de la fidélité ne se
   lisent plus que par leurs ports.
2. **Le propriétaire se voit dans la base**, comme `production`, `delivery`,
   `packing`, `media`.
3. **La frontière est tracée** si un jour il faut des droits d'accès ou un
   service à part.

Ce qui ne change pas : une seule base, donc la passation écrit la commande, ses
remises et la consommation d'un bon de fidélité dans **la même transaction**.
Aucun **bloc** neuf : un bloc à part casserait cette atomicité.

## 2. L'existant (revue du 2026-10-31, à revérifier au bâti)

- **Promotions** (`prisma/schema/public/promotions.prisma`) : `promotions`,
  `promotion_scope_rules`, `promotion_audience_targets`,
  `promotion_pickup_points`, `promotion_delivery_zones`, `promotion_settings`.
  Un seul écrivain : `b2b/promotions`. Lecteurs Prisma hors du contexte :
  `b2b/orders/infrastructure/prisma-order-discount-terms-backfill.ts`,
  `b2b/pricing/infrastructure/prisma-promotion-policy-backfill.ts`,
  `b2b/pricing/infrastructure/prisma-policy-promotion-names.reader.ts`.
  `order_discounts.promotion_id` n'a **pas** de clé étrangère vers
  `promotions` (`order-discounts.prisma:26`, vérifié). Les tables de liaison
  ont des clés vers `pickup_addresses` (RESTRICT) et `delivery_zones`
  (RESTRICT) — qui restent dans `public` : clés **inter-schémas**, à vérifier
  que Postgres et les portes les admettent (une FK entre schémas est légale
  en Postgres ; `lint:cross-schema-join` ne lit que le SQL écrit à la main).
- **Fidélité** (`prisma/schema/public/loyalty.prisma`) : `loyalty_settings`,
  `loyalty_ledger_entries`, `loyalty_vouchers`. Écrites et lues par
  `b2b/loyalty` seul (et le semis) ; `orders` passe par des ports
  (`LoyaltyVoucherQuoteReader`, `LoyaltyVoucherRedemption`). Clés étrangères
  sortantes (vers `companies`, `orders` ?) à relever.
- **Précédent** : `20260930140000_la_livraison_a_son_schema` — `ALTER TABLE …
SET SCHEMA` (aucune ligne réécrite ; index, contraintes, clés et
  déclencheurs suivent), des **vues de compatibilité** pour l'ancien binaire
  le temps du déploiement, supprimées au déploiement suivant, `lock_timeout`
  de 5 s, retour arrière écrit en tête.

## 3. Ce qui change

1. Deux schémas `promotions` et `loyalty` ajoutés au `datasource` ; les
   fichiers Prisma rangés `prisma/schema/promotions/` et
   `prisma/schema/loyalty/` (`lint:prisma-schema-layout`) avec `@@schema`.
2. **Migration écrite à la main** (pas générée : Prisma proposerait de
   supprimer et recréer), sur le modèle du précédent : `CREATE SCHEMA`,
   `ALTER TABLE … SET SCHEMA` pour chaque table, enums et séquences s'il y
   en a, vues de compatibilité `public.<table>` pour l'ancien binaire (ou
   rien, si `vitruve` établit qu'en pré-release la fenêtre est sans risque),
   `lock_timeout = '5s'`, retour arrière écrit. Puis une migration suivante
   qui supprime les vues.
3. **Les trois lecteurs hors contexte passent par des ports** :
   - les noms de promotions lus par la tarification : un port déclaré par
     `pricing`, implémenté par `promotions`, relié dans `appBootstrap` ;
   - les deux scripts de reprise (`prisma/backfill-*`) : ils tournent hors
     Nest et lisent la base en Prisma — vérifier si `lint:cross-schema-join`
     ou `lint:prisma-model-ownership` les couvre ; sinon les laisser lire le
     schéma `promotions` explicitement, documenté.
4. **La porte de propriété apprend les schémas** (si utile) : un modèle d'un
   schéma n'est lu que par son contexte.

## 4. Les tests

- `pnpm --filter lfd-api db:test:setup` puis les e2e des promotions, de la
  fidélité, de la passation et de la révision (atomicité intacte), du
  catalogue et du devis.
- `prisma migrate diff` : aucune dérive entre le schéma et les migrations.
- Les portes, dont `lint:cross-schema-join` et `lint:prisma-schema-layout`.

## 5. vitruve (2026-10-31) — pourquoi le plan est suspendu

Quatre BLOQUANTS : des fonctions plpgsql de `public`
(`bascule_des_promotions`, `controle_des_promotions`,
`cibles_des_promotions_reprises`, `reprise_des_promotions*`) nomment les tables
en dur et neuf suites e2e les appellent ; une clé ENTRANTE
`orders.loyalty_voucher_id → loyalty_vouchers` et des relations Prisma
entrantes (`Site.promotionPoints`, `DeliveryZone.promotionTargets`) ; deux
enums de fidélité dans `public` ; une vingtaine de requêtes brutes qualifiées
`public.` et un e2e qui rejoue une migration figée. Et surtout : aucune porte
n'interdirait davantage après le déplacement (`lint:cross-schema-join` ignore
Prisma, la porte de propriété raisonne par bloc). La valeur promise viendra de
la propriété par contexte, d'abord.
