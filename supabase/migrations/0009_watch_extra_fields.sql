alter table public.watches
  add column if not exists category text
    check (category in ('dress','sport','dive','pilot','chronograph','complications')),
  add column if not exists movement text
    check (char_length(movement) <= 200),
  add column if not exists case_material text
    check (char_length(case_material) <= 200),
  add column if not exists case_diameter text
    check (char_length(case_diameter) <= 50);
