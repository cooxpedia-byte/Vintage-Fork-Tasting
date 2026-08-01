-- Run after creating at least one staff user in Supabase Auth.
-- Replace the UUID placeholder with that user's auth.users.id.
\set staff_id '00000000-0000-0000-0000-000000000001'

insert into public.profiles(id,display_name,role) values (:'staff_id','Salar Melli','admin')
on conflict(id) do update set display_name=excluded.display_name, role=excluded.role;

insert into public.teas(id,name,producer,origin,tea_type,default_character,default_brewing,default_steep_seconds) values
('10000000-0000-0000-0000-000000000001','Ruby 18','Sun Moon Lake smallholder cooperative','Yuchi Township, Nantou, Taiwan','Black','Cinnamon, mint and ripe fruit.','95°C · 3g per 250ml · no rinse',180),
('10000000-0000-0000-0000-000000000002','Dong Ding','Lin family charcoal-roasting workshop','Lugu Township, Nantou, Taiwan','Oolong','Toasted grain, orchid and mineral sweetness.','95°C · 4g per 250ml · rinse once',210),
('10000000-0000-0000-0000-000000000003','Shou Mei','Fuding family garden','Fuding, Fujian, China','White','Mellow orchard fruit and a warm finish.','90°C · 4g per 250ml · no rinse',240),
('10000000-0000-0000-0000-000000000004','Jin Xuan','Meishan high-mountain garden','Chiayi County, Taiwan','Oolong','Creamy texture and floral lift.','92°C · 4g per 250ml · quick rinse',180)
on conflict(id) do nothing;

insert into public.events(id,title,slug,invite_code,status,location_mode,starts_at,timezone,capacity,video_call_url,owner_user_id,host_user_id,backup_host_user_id)
values('20000000-0000-0000-0000-000000000001','Autumn Tea Journey','autumn-tea-journey','AUTUMN-26','scheduled','remote',now()+interval '1 day','America/Edmonton',24,'https://meet.google.com/example',:'staff_id',:'staff_id',null)
on conflict(id) do nothing;

insert into public.event_flight_items(id,event_id,tea_id,position,reveal_title,reveal_description,brewing_instructions,steep_seconds,temperature_c,leaf_grams,water_ml) values
('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',1,'Ruby 18','A deeply aromatic Taiwanese black tea with natural cinnamon, mint and ripe-fruit notes.','95°C · 3g per 250ml · no rinse',180,95,3,250),
('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002',2,'Dong Ding','A charcoal-roasted oolong from Lugu, balancing toasted grain, orchid and mineral sweetness.','95°C · 4g per 250ml · rinse once',210,95,4,250),
('30000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003',3,'Shou Mei','A late-harvest white tea with broad leaves and mellow orchard-fruit sweetness.','90°C · 4g per 250ml · no rinse',240,90,4,250),
('30000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000004',4,'Jin Xuan','A creamy high-mountain oolong with floral lift and gentle dairy-like aroma.','92°C · 4g per 250ml · quick rinse',180,92,4,250)
on conflict(id) do nothing;

insert into public.trivia_questions(event_flight_item_id,question,options,correct_index,explanation,answer_window_seconds) values
('30000000-0000-0000-0000-000000000001','Ruby 18 is associated with which area?','["Alishan","Sun Moon Lake","Wuyi Mountains","Uji"]',1,'Ruby 18 is closely associated with Sun Moon Lake.',20),
('30000000-0000-0000-0000-000000000002','What does Dong Ding commonly translate to?','["Frozen Summit","Golden Lily","Red Jade","Iron Goddess"]',0,'Dong Ding is commonly translated as Frozen Summit.',20),
('30000000-0000-0000-0000-000000000003','Shou Mei belongs to which family?','["Green","White","Black","Dark"]',1,'Shou Mei is a white tea.',20),
('30000000-0000-0000-0000-000000000004','Jin Xuan is also known as?','["Taiwan No. 18","Taiwan No. 12","Qing Xin","Da Ye"]',1,'Jin Xuan is Taiwan Tea No. 12.',20)
on conflict(event_flight_item_id) do nothing;
