-- LES RÈGLES COMPTABLES — le socle du rapport prix public / prix pro.
--
-- Purement ADDITIVE : une table neuve, aucune colonne touchée, aucune donnée
-- déplacée. Le binaire qui tourne aujourd'hui ne la lit pas et continue de
-- fonctionner — c'est le temps « étendre » de `documentation/ops/pipelines.md`.
--
-- Elle est vide à la création, et c'est le modèle : l'absence de ligne signifie
-- « jamais réglé ». Semer une ligne à 10 000 (100 %) affirmerait que le
-- professionnel paie le prix public, ce que personne n'a décidé.
--
-- Aucun prix ne change du fait de cette migration : rien ne LIT encore ce
-- rapport. C'est la tranche 1 de
-- `documentation/pim/architecture-prix-ancre-ttc.md`.

CREATE TABLE "pim"."accounting_rules" (
    "id" TEXT NOT NULL,
    "pro_price_ratio_bp" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_rules_pkey" PRIMARY KEY ("id")
);

-- Le MUR, en base et pas seulement dans le VO : un rapport hors bornes
-- surfacture ou brade TOUT le catalogue d'un coup, et c'est exactement le genre
-- d'écriture qui arrive par un script de reprise, jamais par l'écran.
--
-- Non exprimable dans `schema.prisma` — une `migrate dev` proposera de la
-- supprimer, comme pour `price_rules_no_overlap` : refuser la ligne.
ALTER TABLE "pim"."accounting_rules"
    ADD CONSTRAINT "accounting_rules_pro_ratio_bounds"
    CHECK ("pro_price_ratio_bp" > 0 AND "pro_price_ratio_bp" <= 10000);
