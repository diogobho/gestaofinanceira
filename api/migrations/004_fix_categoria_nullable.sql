-- Migration 004: Tornar categoria nullable para permitir categorias personalizadas
-- Data: 2025-11-02

-- Alterar receitas.categoria para nullable
ALTER TABLE receitas ALTER COLUMN categoria DROP NOT NULL;

-- Alterar despesas.categoria para nullable
ALTER TABLE despesas ALTER COLUMN categoria DROP NOT NULL;

-- Adicionar constraint para garantir que ou categoria ou categoria_custom_id esteja preenchido
ALTER TABLE receitas ADD CONSTRAINT receitas_categoria_check
  CHECK (categoria IS NOT NULL OR categoria_custom_id IS NOT NULL);

ALTER TABLE despesas ADD CONSTRAINT despesas_categoria_check
  CHECK (categoria IS NOT NULL OR categoria_custom_id IS NOT NULL);
