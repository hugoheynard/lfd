-- LE NUMÉRO DE COMMANDE A SON FORMAT — plan T,
-- documentation/commandes/plan-t-commandes-de-test-par-le-vrai-chemin.md (§ 1.3).
--
-- Schéma seulement : AUCUNE donnée écrite, aucune colonne touchée. Un CHECK
-- refuse tout numéro qui n'a pas l'un des deux formats que la production a
-- jamais écrits :
--
--   - le court, `ORD-<n>` sans zéro devant (`formatOrderNumber`, depuis le
--     2026-10-23, f78abfb09) ;
--   - l'ancien, `ORD-<8>-<4>` : l'instant en base 36 en majuscules (8
--     caractères de 1973 à 2059) et 4 caractères [0-9A-Z] — un tirage base 36
--     (55500ec8b, 2026-07-30), puis la fin d'un ULID (171f2abbf, 2026-08-07).
--     Relu sur le code qui le produisait le 2026-10-25.
--
-- Pourquoi : un numéro inventé (`CMD-…`) a fait lever l'arrêt du plan en E1
-- sans qu'aucun test le voie, parce que les fixtures semaient des numéros que
-- la production ne produit pas. Le CHECK rend ces données irréalisables, en
-- test comme ailleurs.
--
-- Comptage avant pose : production 0 numéro atypique (2026-10-24), base de
-- développement locale 0 sur 92 (2026-10-25). Posé NOT VALID puis validé : la
-- validation ne prend qu'un verrou qui laisse lire et écrire.
--
-- Retour arrière : `ALTER TABLE "public"."orders" DROP CONSTRAINT
-- "orders_order_number_format";` — rien d'autre n'en dépend.

ALTER TABLE "public"."orders"
  ADD CONSTRAINT "orders_order_number_format"
  CHECK ("order_number" ~ '^ORD-([1-9][0-9]*|[A-Z0-9]{8}-[A-Z0-9]{4})$') NOT VALID;

ALTER TABLE "public"."orders" VALIDATE CONSTRAINT "orders_order_number_format";
