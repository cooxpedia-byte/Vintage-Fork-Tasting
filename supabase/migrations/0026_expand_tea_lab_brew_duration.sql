alter table public.brewing_setups
  drop constraint if exists brewing_setups_initial_steep_seconds_check,
  add constraint brewing_setups_initial_steep_seconds_check check (
    initial_steep_seconds is null or initial_steep_seconds between 1 and 216000
  );

alter table public.tasting_card_brew_stages
  drop constraint if exists tasting_card_brew_stages_duration_seconds_check,
  add constraint tasting_card_brew_stages_duration_seconds_check check (
    duration_seconds is null or duration_seconds between 1 and 216000
  );
