-- Le texte d'origine d'un texte d'e-mail modifié (2026-10-23) — décision de
-- Hugo, plan `documentation/contenu-ecommerce/plan-textes-des-e-mails.md`
-- (§2 quinquies) : signaler un texte modifié à l'écran dont le texte du code
-- a changé depuis.
--
-- ADDITIVE : deux colonnes nullables, aucune donnée réécrite, aucun droit.
--
-- On garde le TEXTE, pas une empreinte : l'écran montre l'ancien texte du
-- code à côté du nouveau, et une empreinte ne se relit pas.
--
-- Les lignes existantes restent à NULL = inconnu, donc sans signal. Les
-- remplir avec le défaut d'aujourd'hui demanderait de recopier ici les 975
-- textes du dictionnaire, et affirmerait qu'elles ont été écrites contre lui
-- — ce que rien ne garantit. La prochaine écriture de chacune les renseigne.

ALTER TABLE "public"."mail_copy_entries"
    ADD COLUMN "draft_default_text" TEXT,
    ADD COLUMN "published_default_text" TEXT;
