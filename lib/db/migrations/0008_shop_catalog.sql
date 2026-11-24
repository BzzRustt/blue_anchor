-- Expand the preview catalogue while preserving every existing interest row.
ALTER TABLE shop_interests
  DROP CONSTRAINT IF EXISTS shop_interests_product_check;

ALTER TABLE shop_interests
  ADD CONSTRAINT shop_interests_product_check
  CHECK (product IN ('patch', 'shirt', 'card', 'stickers', 'table_cards', 'event_badges'));
