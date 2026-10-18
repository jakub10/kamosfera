-- Nálepky Kamosféry v obchodě (placené). Zdarma jsou kamos-wave, kamos-thumbsup
-- a kamos-celebrate — ty v ceníku být nemusí.
INSERT INTO public.vip_items (item_id, item_type, price) VALUES
  ('kamos-chat', 'emoji', 25),
  ('kamos-thinking', 'emoji', 25),
  ('kamos-surprised', 'emoji', 25),
  ('kamos-sad', 'emoji', 25),
  ('kamos-sleep', 'emoji', 25),
  ('kamos-reading', 'emoji', 25),
  ('kamos-search', 'emoji', 25),
  ('kamos-gaming', 'emoji', 50),
  ('kamos-friends', 'emoji', 50),
  ('kamos-paint', 'emoji', 50),
  ('kamos-lost', 'emoji', 50),
  ('kamos-trophy', 'emoji', 75),
  ('kamos-vip', 'emoji', 100)
ON CONFLICT (item_id) DO UPDATE SET price = EXCLUDED.price, item_type = EXCLUDED.item_type;
