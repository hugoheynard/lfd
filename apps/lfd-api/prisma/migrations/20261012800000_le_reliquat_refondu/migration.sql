-- LE RELIQUAT REFONDU — une valeur d'enum neuve, SEULE
--
-- Plan `documentation/order/plan-annulation-de-commande.md`, lot C3b (C3b.2).
-- `merged_back` : un reliquat refondu dans son bon d'origine, à l'annulation
-- de la commande qui l'avait fait naître. Ni `cancelled` (qui exige un auteur
-- staff et un motif, et dit « valeur retirée »), ni une suppression : la
-- refusion REND la valeur au parent, et le reliquat reste comme pièce.
--
-- SEULE dans sa migration : une valeur d'enum ne s'emploie pas dans la
-- transaction qui l'ajoute — `20261012800100_la_refusion_du_bon` l'emploie.
--
-- ⚠️ IRRÉVERSIBLE, et sans conséquence : Postgres ne sait pas ôter une valeur
-- d'enum. Un retour arrière la laisse en place, inutilisée.

ALTER TYPE "public"."LoyaltyVoucherStatus" ADD VALUE IF NOT EXISTS 'merged_back';
