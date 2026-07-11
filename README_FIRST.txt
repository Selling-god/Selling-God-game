-- 판매의 신 v12 RELEASE DATABASE MIGRATION
-- Supabase SQL Editor에서 전체 실행하세요. 기존 데이터는 삭제하지 않습니다.

create extension if not exists pgcrypto;

-- 거래 가능 아이템 500종
alter table public.items add column if not exists icon text not null default '📦';

-- 신규 계정 시작 자금 50만원
alter table public.profiles add column if not exists job_count integer not null default 0;
alter table public.profiles alter column cash set default 500000;

create table if not exists public.exploration_sessions(
 token uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 location text not null,
 item_id uuid not null references public.items(id),
 target_condition integer not null,
 difficulty integer not null,
 completed boolean not null default false,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default(now()+interval '10 minutes')
);

create table if not exists public.npc_market_offers(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 user_item_id uuid not null references public.user_items(id) on delete cascade,
 offer_price numeric(20,0) not null,
 max_price numeric(20,0) not null,
 status text not null default 'active' check(status in('active','accepted','expired')),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default(now()+interval '2 hours')
);

create table if not exists public.auctions(
 id uuid primary key default gen_random_uuid(),
 item_id uuid not null references public.items(id),
 condition_score integer not null,
 current_price numeric(20,0) not null,
 highest_bidder uuid references public.profiles(id),
 npc_stopped boolean not null default false,
 status text not null default 'active' check(status in('active','sold','expired')),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default(now()+interval '30 minutes')
);

create table if not exists public.collectibles(
 id uuid primary key default gen_random_uuid(),
 name text unique not null,
 type text not null check(type in('phone_case','decoration')),
 rarity text not null,
 effect_code text not null,
 effect_name text not null,
 effect_percent numeric(6,2) not null,
 icon text not null default '✨',
 weight integer not null default 100
);

create table if not exists public.user_collectibles(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 collectible_id uuid not null references public.collectibles(id),
 is_equipped boolean not null default false,
 is_placed boolean not null default false,
 is_listed boolean not null default false,
 acquired_at timestamptz not null default now()
);

create table if not exists public.collectible_listings(
 id uuid primary key default gen_random_uuid(),
 seller_user_id uuid not null references public.profiles(id) on delete cascade,
 user_collectible_id uuid not null references public.user_collectibles(id) on delete cascade,
 asking_price numeric(20,0) not null check(asking_price>0),
 status text not null default 'active' check(status in('active','sold','cancelled')),
 created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.profiles(id,nickname,cash)
 values(new.id,coalesce(nullif(trim(new.raw_user_meta_data->>'nickname'),''),'판매왕_'||substring(new.id::text,1,8)),500000)
 on conflict(id) do nothing;
 return new;
end$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.ensure_player_save()
returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid();
begin
 insert into public.profiles(id,nickname,cash)
 select uid,coalesce(nullif(trim(raw_user_meta_data->>'nickname'),''),'판매왕_'||substring(uid::text,1,8)),500000
 from auth.users where id=uid on conflict(id) do nothing;

 update public.profiles p
 set cash=500000
 where p.id=uid and coalesce(p.cash,0)=0
   and not exists(select 1 from public.user_items ui where ui.user_id=uid)
   and not exists(select 1 from public.stock_holdings sh where sh.user_id=uid)
   and not exists(select 1 from public.user_collectibles uc where uc.user_id=uid);
 return jsonb_build_object('success',true);
end$$;

create or replace function public.get_active_effects()
returns jsonb language sql security definer set search_path=public as $$
 select coalesce(jsonb_object_agg(effect_code,total),'{}'::jsonb)
 from(
  select c.effect_code,sum(c.effect_percent) total
  from public.user_collectibles uc join public.collectibles c on c.id=uc.collectible_id
  where uc.user_id=auth.uid() and(uc.is_equipped or uc.is_placed)
  group by c.effect_code
 )x
$$;

create or replace function public.prepare_exploration(p_location text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare found public.items%rowtype;cond integer;diff integer;t uuid;luck numeric:=0;
begin
 select coalesce((public.get_active_effects()->>'exploration_luck')::numeric,0) into luck;
 select * into found from public.items where location=p_location
 order by -ln(greatest(random(),.000001))/greatest(find_weight*(1+luck/100),1) limit 1;
 if p_location='street' then cond:=floor(random()*61)+20;
 elsif p_location in('alley','mountain') then cond:=case when random()<.82 then floor(random()*36)+5 else floor(random()*41)+40 end;
 else raise exception '잘못된 장소입니다.';end if;
 diff:=greatest(1,least(10,ceil(cond/10.0)));
 insert into public.exploration_sessions(user_id,location,item_id,target_condition,difficulty)
 values(auth.uid(),p_location,found.id,cond,diff) returning token into t;
 return jsonb_build_object('token',t,'target_condition',cond,'difficulty',diff,'rarity_hint',found.rarity);
end$$;

create or replace function public.complete_exploration(p_token uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.exploration_sessions%rowtype;i public.items%rowtype;
begin
 select * into s from public.exploration_sessions where token=p_token and user_id=auth.uid() and not completed and expires_at>now() for update;
 if s.token is null then raise exception '유효하지 않은 탐색입니다.';end if;
 select * into i from public.items where id=s.item_id;
 insert into public.user_items(user_id,item_id,condition_score) values(auth.uid(),s.item_id,s.target_condition);
 update public.exploration_sessions set completed=true where token=p_token;
 return jsonb_build_object('item_name',i.name,'category',i.category,'rarity',i.rarity,'condition_score',s.target_condition);
end$$;

create or replace function public.sell_item_to_pawnshop(p_user_item_id uuid,p_mode text,p_offer_percent integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare base numeric;cond integer;final numeric;bonus numeric:=0;maxpct numeric;
begin
 select i.average_price,ui.condition_score into base,cond
 from public.user_items ui join public.items i on i.id=ui.item_id
 where ui.id=p_user_item_id and ui.user_id=auth.uid() and not ui.is_listed for update;
 if base is null then raise exception '판매할 수 없습니다.';end if;
 select coalesce((public.get_active_effects()->>'pawn_bonus')::numeric,0) into bonus;
 base:=round(base*(case when cond>=95 then 1.35 when cond>=85 then 1.18 when cond>=70 then 1 when cond>=50 then .78 when cond>=30 then .55 else .3 end));
 maxpct:=108+least(30,bonus);
 if p_mode='instant' then p_offer_percent:=100;end if;
 if p_offer_percent<100 or p_offer_percent>maxpct then raise exception 'NPC가 그 가격을 거절했습니다.';end if;
 final:=round(base*p_offer_percent/100.0);
 update public.profiles set cash=cash+final where id=auth.uid();
 delete from public.user_items where id=p_user_item_id and user_id=auth.uid();
 return jsonb_build_object('success',true,'final_price',final);
end$$;

create or replace function public.get_or_create_auction()
returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.auctions%rowtype;i public.items%rowtype;
begin
 select * into a from public.auctions where status='active' and expires_at>now() order by created_at desc limit 1;
 if a.id is null then
  select * into i from public.items where rarity in('진귀','보물','전설') order by random() limit 1;
  insert into public.auctions(item_id,condition_score,current_price)
  values(i.id,floor(random()*31)+70,round(i.average_price*(.65+random()*.2))) returning * into a;
 else select * into i from public.items where id=a.item_id;end if;
 return jsonb_build_object('auction_id',a.id,'item_name',i.name,'category',i.category,'rarity',i.rarity,'current_price',a.current_price,'player_highest',a.highest_bidder=auth.uid(),'npc_stopped',a.npc_stopped);
end$$;

create or replace function public.npc_auction_step(p_auction_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.auctions%rowtype;r numeric;inc numeric;act text;
begin
 select * into a from public.auctions where id=p_auction_id and status='active' for update;
 if a.npc_stopped then return jsonb_build_object('action','hold','current_price',a.current_price,'increment',0);end if;
 r:=random();
 if r<.28 then act:='hold';inc:=0;update public.auctions set npc_stopped=true where id=a.id;
 elsif r<.82 then act:='raise';inc:=round(a.current_price*(.02+random()*.05));update public.auctions set current_price=current_price+inc,highest_bidder=null where id=a.id;
 else act:='jump';inc:=round(a.current_price*(.10+random()*.16));update public.auctions set current_price=current_price+inc,highest_bidder=null where id=a.id;end if;
 select * into a from public.auctions where id=p_auction_id;
 return jsonb_build_object('action',act,'current_price',a.current_price,'increment',inc);
end$$;

create or replace function public.place_auction_bid(p_auction_id uuid,p_bid_amount numeric)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.auctions%rowtype;
begin
 select * into a from public.auctions where id=p_auction_id and status='active' for update;
 if p_bid_amount<=a.current_price then raise exception '현재가보다 높게 입찰하세요.';end if;
 if not exists(select 1 from public.profiles where id=auth.uid() and cash>=p_bid_amount) then raise exception '자금 부족';end if;
 update public.auctions set current_price=round(p_bid_amount),highest_bidder=auth.uid() where id=a.id;
 return jsonb_build_object('current_price',round(p_bid_amount));
end$$;

create or replace function public.claim_auction(p_auction_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.auctions%rowtype;discount numeric:=0;final numeric;
begin
 select * into a from public.auctions where id=p_auction_id and status='active' for update;
 if a.highest_bidder<>auth.uid() or not a.npc_stopped then return jsonb_build_object('won',false);end if;
 select coalesce((public.get_active_effects()->>'auction_discount')::numeric,0) into discount;
 final:=round(a.current_price*(1-least(discount,25)/100));
 if not exists(select 1 from public.profiles where id=auth.uid() and cash>=final) then raise exception '자금 부족';end if;
 update public.profiles set cash=cash-final where id=auth.uid();
 insert into public.user_items(user_id,item_id,condition_score) values(auth.uid(),a.item_id,a.condition_score);
 update public.auctions set status='sold' where id=a.id;
 return jsonb_build_object('won',true,'final_price',final);
end$$;

create or replace function public.generate_npc_market_offers()
returns jsonb language plpgsql security definer set search_path=public as $$
declare bonus numeric:=0;
begin
 update public.npc_market_offers set status='expired' where status='active' and expires_at<=now();
 select coalesce((public.get_active_effects()->>'market_bonus')::numeric,0) into bonus;
 insert into public.npc_market_offers(user_id,user_item_id,offer_price,max_price)
 select auth.uid(),ui.id,
 round(i.average_price*(case when ui.condition_score>=70 then 1 else .55 end)*(.75+random()*.25)*(1+bonus/100)),
 round(i.average_price*(case when ui.condition_score>=70 then 1.15 else .72 end)*(1+bonus/100))
 from public.user_items ui join public.items i on i.id=ui.item_id
 where ui.user_id=auth.uid() and not ui.is_listed and random()<.18
 and not exists(select 1 from public.npc_market_offers o where o.user_item_id=ui.id and o.status='active')
 limit 3;
 return jsonb_build_object('success',true);
end$$;

create or replace function public.accept_npc_market_offer(p_offer_id uuid,p_final_price numeric)
returns jsonb language plpgsql security definer set search_path=public as $$
declare o public.npc_market_offers%rowtype;
begin
 select * into o from public.npc_market_offers where id=p_offer_id and user_id=auth.uid() and status='active' for update;
 if p_final_price<o.offer_price or p_final_price>o.max_price then raise exception 'NPC가 가격을 거절했습니다.';end if;
 update public.profiles set cash=cash+p_final_price where id=auth.uid();
 delete from public.user_items where id=o.user_item_id and user_id=auth.uid();
 update public.npc_market_offers set status='accepted' where id=o.id;
 return jsonb_build_object('success',true,'final_price',p_final_price);
end$$;

create or replace function public.draw_collectible()
returns jsonb language plpgsql security definer set search_path=public as $$
declare c public.collectibles%rowtype;luck numeric:=0;cost numeric:=100000;
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and cash>=cost) then raise exception '뽑기 비용 부족';end if;
 select coalesce((public.get_active_effects()->>'gacha_luck')::numeric,0) into luck;
 select * into c from public.collectibles order by -ln(greatest(random(),.000001))/greatest(weight*(1+luck/100),1) limit 1;
 update public.profiles set cash=cash-cost where id=auth.uid();
 insert into public.user_collectibles(user_id,collectible_id) values(auth.uid(),c.id);
 return jsonb_build_object('name',c.name,'rarity',c.rarity,'effect_name',c.effect_name,'effect_percent',c.effect_percent);
end$$;

create or replace function public.equip_collectible(p_user_collectible_id uuid,p_action text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare ctype text;
begin
 select c.type into ctype from public.user_collectibles uc join public.collectibles c on c.id=uc.collectible_id where uc.id=p_user_collectible_id and uc.user_id=auth.uid();
 if p_action='equip' and ctype='phone_case' then
  update public.user_collectibles uc set is_equipped=false from public.collectibles c where uc.collectible_id=c.id and uc.user_id=auth.uid() and c.type='phone_case';
  update public.user_collectibles set is_equipped=true where id=p_user_collectible_id;
 elsif p_action='place' and ctype='decoration' then
  update public.user_collectibles set is_placed=not is_placed where id=p_user_collectible_id;
 else raise exception '잘못된 적용';end if;
 return jsonb_build_object('success',true);
end$$;

create or replace function public.create_collectible_listing(p_user_collectible_id uuid,p_price numeric)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from public.user_collectibles where id=p_user_collectible_id and user_id=auth.uid() and not is_equipped and not is_placed and not is_listed) then raise exception '판매 불가';end if;
 insert into public.collectible_listings(seller_user_id,user_collectible_id,asking_price) values(auth.uid(),p_user_collectible_id,round(p_price));
 update public.user_collectibles set is_listed=true where id=p_user_collectible_id;
 return jsonb_build_object('success',true);
end$$;

create or replace function public.buy_collectible_listing(p_listing_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare l public.collectible_listings%rowtype;
begin
 select * into l from public.collectible_listings where id=p_listing_id and status='active' for update;
 if l.seller_user_id=auth.uid() then raise exception '자기 소장품 구매 불가';end if;
 if not exists(select 1 from public.profiles where id=auth.uid() and cash>=l.asking_price) then raise exception '자금 부족';end if;
 update public.profiles set cash=cash-l.asking_price where id=auth.uid();
 update public.profiles set cash=cash+l.asking_price where id=l.seller_user_id;
 update public.user_collectibles set user_id=auth.uid(),is_listed=false where id=l.user_collectible_id;
 update public.collectible_listings set status='sold' where id=l.id;
 return jsonb_build_object('success',true,'final_price',l.asking_price);
end$$;

create or replace function public.cancel_collectible_listing(p_listing_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare cid uuid;
begin
 select user_collectible_id into cid from public.collectible_listings where id=p_listing_id and seller_user_id=auth.uid() and status='active' for update;
 update public.collectible_listings set status='cancelled' where id=p_listing_id;
 update public.user_collectibles set is_listed=false where id=cid;
 return jsonb_build_object('success',true);
end$$;

alter table public.exploration_sessions enable row level security;
alter table public.npc_market_offers enable row level security;
alter table public.auctions enable row level security;
alter table public.collectibles enable row level security;
alter table public.user_collectibles enable row level security;
alter table public.collectible_listings enable row level security;

drop policy if exists npc_offer_read on public.npc_market_offers;
create policy npc_offer_read on public.npc_market_offers for select to authenticated using(user_id=auth.uid());
drop policy if exists auctions_read on public.auctions;
create policy auctions_read on public.auctions for select to authenticated using(true);
drop policy if exists collectibles_read on public.collectibles;
create policy collectibles_read on public.collectibles for select to authenticated using(true);
drop policy if exists user_collectibles_read on public.user_collectibles;
create policy user_collectibles_read on public.user_collectibles for select to authenticated using(user_id=auth.uid());
drop policy if exists collectible_listings_read on public.collectible_listings;
create policy collectible_listings_read on public.collectible_listings for select to authenticated using(true);

insert into public.collectibles(name,type,rarity,effect_code,effect_name,effect_percent,icon,weight) values
('네온 시티 케이스','phone_case','일반','market_bonus','NPC 제안가',2,'🌆',140),
('골드 크라운 케이스','phone_case','희귀','pawn_bonus','전당포 판매가',5,'👑',65),
('오로라 케이스','phone_case','영웅','gacha_luck','뽑기 희귀도',8,'🌌',25),
('행운 고양이 케이스','phone_case','전설','exploration_luck','탐색 희귀도',12,'🐱',8),
('작은 금고','decoration','일반','pawn_bonus','전당포 판매가',2,'🗄️',130),
('상인 포스터','decoration','일반','market_bonus','NPC 제안가',2,'🖼️',130),
('황금 망치','decoration','희귀','auction_discount','경매 낙찰 할인',5,'🔨',55),
('주식 전광판','decoration','희귀','stock_fee_discount','주식 수수료 할인',5,'📊',55),
('행운 분수','decoration','영웅','gacha_luck','뽑기 희귀도',8,'⛲',20),
('보물 진열장','decoration','전설','exploration_luck','탐색 희귀도',12,'🏆',7)
on conflict(name) do update set effect_percent=excluded.effect_percent,weight=excluded.weight;

grant execute on function public.ensure_player_save() to authenticated;
grant execute on function public.get_active_effects() to authenticated;
grant execute on function public.prepare_exploration(text) to authenticated;
grant execute on function public.complete_exploration(uuid) to authenticated;
grant execute on function public.sell_item_to_pawnshop(uuid,text,integer) to authenticated;
grant execute on function public.get_or_create_auction() to authenticated;
grant execute on function public.npc_auction_step(uuid) to authenticated;
grant execute on function public.place_auction_bid(uuid,numeric) to authenticated;
grant execute on function public.claim_auction(uuid) to authenticated;
grant execute on function public.generate_npc_market_offers() to authenticated;
grant execute on function public.accept_npc_market_offer(uuid,numeric) to authenticated;
grant execute on function public.draw_collectible() to authenticated;
grant execute on function public.equip_collectible(uuid,text) to authenticated;
grant execute on function public.create_collectible_listing(uuid,numeric) to authenticated;
grant execute on function public.buy_collectible_listing(uuid) to authenticated;
grant execute on function public.cancel_collectible_listing(uuid) to authenticated;


-- 25개 분류 x 20종 = 정확히 500종
insert into public.items(name,icon,category,average_price,is_average_price_known,rarity,location,find_weight) values
('스마트폰','📱','전자기기',15000,true,'일반','street',130),
('폴더폰','📱','전자기기',22000,true,'일반','alley',130),
('태블릿','📱','전자기기',29000,true,'일반','mountain',130),
('노트북','📱','전자기기',21000,true,'일반','street',130),
('전자책리더','📱','전자기기',28000,true,'일반','alley',130),
('전자사전','📱','전자기기',20000,true,'일반','mountain',130),
('계산기','📱','전자기기',27000,true,'일반','street',130),
('무전기','📱','전자기기',19000,true,'일반','alley',130),
('GPS단말기','📱','전자기기',26000,true,'일반','mountain',130),
('스마트밴드','📱','전자기기',18000,true,'일반','street',130),
('보조배터리','📱','전자기기',45000,true,'희소','alley',85),
('미니프로젝터','📱','전자기기',31000,true,'희소','mountain',85),
('디지털액자','📱','전자기기',43000,true,'희소','street',85),
('웹캠','📱','전자기기',29000,true,'희소','alley',85),
('휴대용스캐너','📱','전자기기',41000,true,'희소','mountain',85),
('전자온도계','📱','전자기기',48000,false,'진귀','street',45),
('휴대용프린터','📱','전자기기',70000,false,'진귀','alley',45),
('USB허브','📱','전자기기',93000,false,'진귀','mountain',45),
('전자메모패드','📱','전자기기',126000,false,'보물','street',20),
('소형모니터','📱','전자기기',280000,false,'전설','alley',8),
('진공관라디오','📻','음향기기',24000,true,'일반','alley',130),
('카세트플레이어','📻','음향기기',33000,true,'일반','mountain',130),
('턴테이블','📻','음향기기',23000,true,'일반','street',130),
('블루투스스피커','📻','음향기기',32000,true,'일반','alley',130),
('헤드폰','📻','음향기기',21000,true,'일반','mountain',130),
('이어폰','📻','음향기기',30000,true,'일반','street',130),
('워크맨','📻','음향기기',20000,true,'일반','alley',130),
('미니앰프','📻','음향기기',29000,true,'일반','mountain',130),
('리시버','📻','음향기기',38000,true,'일반','street',130),
('CD플레이어','📻','음향기기',28000,true,'일반','alley',130),
('오픈릴데크','📻','음향기기',67000,true,'희소','mountain',85),
('포터블라디오','📻','음향기기',48000,true,'희소','street',85),
('마이크','📻','음향기기',64000,true,'희소','alley',85),
('믹서','📻','음향기기',45000,true,'희소','mountain',85),
('사운드바','📻','음향기기',62000,true,'희소','street',85),
('축음기','📻','음향기기',76000,false,'진귀','alley',45),
('녹음기','📻','음향기기',106000,false,'진귀','mountain',45),
('메트로놈','📻','음향기기',72000,false,'진귀','street',45),
('우퍼스피커','📻','음향기기',191000,false,'보물','alley',20),
('북셀프스피커','📻','음향기기',212000,false,'전설','mountain',8),
('필름카메라','📷','사진장비',35000,true,'일반','mountain',130),
('즉석카메라','📷','사진장비',46000,true,'일반','street',130),
('디지털카메라','📷','사진장비',33000,true,'일반','alley',130),
('캠코더','📷','사진장비',45000,true,'일반','mountain',130),
('카메라렌즈','📷','사진장비',31000,true,'일반','street',130),
('삼각대','📷','사진장비',43000,true,'일반','alley',130),
('플래시','📷','사진장비',30000,true,'일반','mountain',130),
('노출계','📷','사진장비',41000,true,'일반','street',130),
('쌍안경','📷','사진장비',28000,true,'일반','alley',130),
('현미경카메라','📷','사진장비',40000,true,'일반','mountain',130),
('카메라가방','📷','사진장비',48000,true,'희소','street',85),
('렌즈필터','📷','사진장비',68000,true,'희소','alley',85),
('필름스캐너','📷','사진장비',45000,true,'희소','mountain',85),
('사진확대기','📷','사진장비',65000,true,'희소','street',85),
('슬라이드프로젝터','📷','사진장비',86000,true,'희소','alley',85),
('거리계','📷','사진장비',111000,false,'진귀','mountain',45),
('액션캠','📷','사진장비',148000,false,'진귀','street',45),
('드론카메라','📷','사진장비',106000,false,'진귀','alley',45),
('수중카메라','📷','사진장비',267000,false,'보물','mountain',20),
('폴라로이드앨범','📷','사진장비',314000,false,'전설','street',8),
('회중시계','⌚','시계',47000,true,'일반','street',130),
('손목시계','⌚','시계',32000,true,'일반','alley',130),
('벽시계','⌚','시계',45000,true,'일반','mountain',130),
('탁상시계','⌚','시계',30000,true,'일반','street',130),
('괘종시계','⌚','시계',43000,true,'일반','alley',130),
('해시계모형','⌚','시계',57000,true,'일반','mountain',130),
('알람시계','⌚','시계',41000,true,'일반','street',130),
('디지털시계','⌚','시계',55000,true,'일반','alley',130),
('스톱워치','⌚','시계',40000,true,'일반','mountain',130),
('스켈레톤시계','⌚','시계',53000,true,'일반','street',130),
('문페이즈시계','⌚','시계',68000,true,'희소','alley',85),
('군용시계','⌚','시계',92000,true,'희소','mountain',85),
('다이버시계','⌚','시계',64000,true,'희소','street',85),
('파일럿시계','⌚','시계',89000,true,'희소','alley',85),
('자동태엽시계','⌚','시계',60000,true,'희소','mountain',85),
('수동태엽시계','⌚','시계',152000,false,'진귀','street',45),
('세계시각시계','⌚','시계',101000,false,'진귀','alley',45),
('나무프레임시계','⌚','시계',145000,false,'진귀','mountain',45),
('황동시계','⌚','시계',178000,false,'보물','street',20),
('도자기시계','⌚','시계',434000,false,'전설','alley',8),
('무쇠프라이팬','🍳','주방용품',62000,true,'일반','alley',130),
('구리냄비','🍳','주방용품',44000,true,'일반','mountain',130),
('주철냄비','🍳','주방용품',60000,true,'일반','street',130),
('도자기주전자','🍳','주방용품',41000,true,'일반','alley',130),
('커피그라인더','🍳','주방용품',58000,true,'일반','mountain',130),
('에스프레소포트','🍳','주방용품',39000,true,'일반','street',130),
('토스터','🍳','주방용품',55000,true,'일반','alley',130),
('와플기계','🍳','주방용품',37000,true,'일반','mountain',130),
('수동착즙기','🍳','주방용품',53000,true,'일반','street',130),
('빵칼','🍳','주방용품',34000,true,'일반','alley',130),
('셰프나이프','🍳','주방용품',91000,true,'희소','mountain',85),
('원목도마','🍳','주방용품',120000,true,'희소','street',85),
('은수저세트','🍳','주방용품',87000,true,'희소','alley',85),
('찻잔세트','🍳','주방용품',116000,true,'희소','mountain',85),
('양념통세트','🍳','주방용품',83000,true,'희소','street',85),
('주방저울','🍳','주방용품',199000,false,'진귀','alley',45),
('병따개','🍳','주방용품',140000,false,'진귀','mountain',45),
('보온병','🍳','주방용품',191000,false,'진귀','street',45),
('도시락통','🍳','주방용품',248000,false,'보물','alley',20),
('계량컵세트','🍳','주방용품',575000,false,'전설','mountain',8),
('빈티지우산','🏠','생활용품',39000,true,'일반','mountain',130),
('재봉틀','🏠','생활용품',58000,true,'일반','street',130),
('다리미','🏠','생활용품',76000,true,'일반','alley',130),
('선풍기','🏠','생활용품',55000,true,'일반','mountain',130),
('전화기','🏠','생활용품',74000,true,'일반','street',130),
('타자기','🏠','생활용품',52000,true,'일반','alley',130),
('손거울','🏠','생활용품',71000,true,'일반','mountain',130),
('빗세트','🏠','생활용품',50000,true,'일반','street',130),
('가죽트렁크','🏠','생활용품',68000,true,'일반','alley',130),
('나무옷걸이','🏠','생활용품',47000,true,'일반','mountain',130),
('황동촛대','🏠','생활용품',118000,true,'희소','street',85),
('우편함','🏠','생활용품',80000,true,'희소','alley',85),
('도어벨','🏠','생활용품',113000,true,'희소','mountain',85),
('화병','🏠','생활용품',76000,true,'희소','street',85),
('손전등','🏠','생활용품',109000,true,'희소','alley',85),
('벽난로도구','🏠','생활용품',126000,false,'진귀','mountain',45),
('수동청소기','🏠','생활용품',185000,false,'진귀','street',45),
('재떨이','🏠','생활용품',244000,false,'진귀','alley',45),
('금속바구니','🏠','생활용품',331000,false,'보물','mountain',20),
('양산','🏠','생활용품',735000,false,'전설','street',8),
('원목의자','🪑','가구',53000,true,'일반','street',130),
('흔들의자','🪑','가구',74000,true,'일반','alley',130),
('사이드테이블','🪑','가구',50000,true,'일반','mountain',130),
('협탁','🪑','가구',71000,true,'일반','street',130),
('서랍장','🪑','가구',47000,true,'일반','alley',130),
('책장','🪑','가구',68000,true,'일반','mountain',130),
('화장대','🪑','가구',44000,true,'일반','street',130),
('벤치','🪑','가구',65000,true,'일반','alley',130),
('스툴','🪑','가구',86000,true,'일반','mountain',130),
('티테이블','🪑','가구',62000,true,'일반','street',130),
('식탁의자','🪑','가구',149000,true,'희소','alley',85),
('바스툴','🪑','가구',106000,true,'희소','mountain',85),
('접이식의자','🪑','가구',143000,true,'희소','street',85),
('라탄의자','🪑','가구',101000,true,'희소','alley',85),
('장식선반','🪑','가구',138000,true,'희소','mountain',85),
('문갑','🪑','가구',170000,false,'진귀','street',45),
('약장','🪑','가구',236000,false,'진귀','alley',45),
('콘솔테이블','🪑','가구',160000,false,'진귀','mountain',45),
('우드캐비닛','🪑','가구',425000,false,'보물','street',20),
('잡지꽂이','🪑','가구',472000,false,'전설','alley',8),
('은행원램프','💡','조명',69000,true,'일반','alley',130),
('스테인드글라스램프','💡','조명',92000,true,'일반','mountain',130),
('황동스탠드','💡','조명',66000,true,'일반','street',130),
('석유램프','💡','조명',88000,true,'일반','alley',130),
('벽걸이등','💡','조명',62000,true,'일반','mountain',130),
('샹들리에','💡','조명',85000,true,'일반','street',130),
('독서등','💡','조명',59000,true,'일반','alley',130),
('작업등','💡','조명',82000,true,'일반','mountain',130),
('네온사인','💡','조명',56000,true,'일반','street',130),
('캠핑랜턴','💡','조명',79000,true,'일반','alley',130),
('도자기램프','💡','조명',94000,true,'희소','mountain',85),
('유리펜던트등','💡','조명',136000,true,'희소','street',85),
('촛대형조명','💡','조명',88000,true,'희소','alley',85),
('철제스탠드','💡','조명',130000,true,'희소','mountain',85),
('천장등','💡','조명',171000,true,'희소','street',85),
('갓등','💡','조명',220000,false,'진귀','alley',45),
('벽난로랜턴','💡','조명',293000,false,'진귀','mountain',45),
('무드등','💡','조명',210000,false,'진귀','street',45),
('탁상램프','💡','조명',531000,false,'보물','alley',20),
('마차랜턴','💡','조명',622000,false,'전설','mountain',8),
('가죽재킷','👕','의류',86000,true,'일반','mountain',130),
('트렌치코트','👕','의류',58000,true,'일반','street',130),
('데님재킷','👕','의류',83000,true,'일반','alley',130),
('울코트','👕','의류',54000,true,'일반','mountain',130),
('군용야상','👕','의류',79000,true,'일반','street',130),
('야구점퍼','👕','의류',104000,true,'일반','alley',130),
('캐시미어니트','👕','의류',76000,true,'일반','mountain',130),
('실크셔츠','👕','의류',101000,true,'일반','street',130),
('린넨셔츠','👕','의류',72000,true,'일반','alley',130),
('하와이안셔츠','👕','의류',97000,true,'일반','mountain',130),
('승마재킷','👕','의류',123000,true,'희소','street',85),
('벨벳조끼','👕','의류',168000,true,'희소','alley',85),
('작업복','👕','의류',117000,true,'희소','mountain',85),
('한복저고리','👕','의류',162000,true,'희소','street',85),
('두루마기','👕','의류',110000,true,'희소','alley',85),
('레인코트','👕','의류',276000,false,'진귀','mountain',45),
('오버올','👕','의류',184000,false,'진귀','street',45),
('플리츠스커트','👕','의류',265000,false,'진귀','alley',45),
('정장바지','👕','의류',324000,false,'보물','mountain',20),
('빈티지청바지','👕','의류',792000,false,'전설','street',8),
('가죽서류가방','👜','패션잡화',106000,true,'일반','street',130),
('숄더백','👜','패션잡화',75000,true,'일반','alley',130),
('클러치백','👜','패션잡화',102000,true,'일반','mountain',130),
('여행가방','👜','패션잡화',71000,true,'일반','street',130),
('동전지갑','👜','패션잡화',98000,true,'일반','alley',130),
('장지갑','👜','패션잡화',67000,true,'일반','mountain',130),
('가죽벨트','👜','패션잡화',94000,true,'일반','street',130),
('실크스카프','👜','패션잡화',63000,true,'일반','alley',130),
('중절모','👜','패션잡화',90000,true,'일반','mountain',130),
('베레모','👜','패션잡화',59000,true,'일반','street',130),
('선글라스','👜','패션잡화',155000,true,'희소','alley',85),
('안경테','👜','패션잡화',205000,true,'희소','mountain',85),
('브로치','👜','패션잡화',148000,true,'희소','street',85),
('커프스단추','👜','패션잡화',198000,true,'희소','alley',85),
('넥타이핀','👜','패션잡화',141000,true,'희소','mountain',85),
('장갑','👜','패션잡화',339000,false,'진귀','street',45),
('가죽부츠','👜','패션잡화',239000,false,'진귀','alley',45),
('로퍼','👜','패션잡화',327000,false,'진귀','mountain',45),
('우산손잡이','👜','패션잡화',424000,false,'보물','street',20),
('은제빗','👜','패션잡화',981000,false,'전설','alley',8),
('야구글러브','🏅','스포츠',64000,true,'일반','alley',130),
('야구배트','🏅','스포츠',94000,true,'일반','mountain',130),
('축구공','🏅','스포츠',123000,true,'일반','street',130),
('농구공','🏅','스포츠',89000,true,'일반','alley',130),
('테니스라켓','🏅','스포츠',119000,true,'일반','mountain',130),
('배드민턴라켓','🏅','스포츠',85000,true,'일반','street',130),
('골프퍼터','🏅','스포츠',115000,true,'일반','alley',130),
('골프아이언','🏅','스포츠',81000,true,'일반','mountain',130),
('복싱글러브','🏅','스포츠',110000,true,'일반','street',130),
('탁구라켓','🏅','스포츠',76000,true,'일반','alley',130),
('볼링공','🏅','스포츠',191000,true,'희소','mountain',85),
('스케이트보드','🏅','스포츠',130000,true,'희소','street',85),
('롤러스케이트','🏅','스포츠',184000,true,'희소','alley',85),
('스키고글','🏅','스포츠',122000,true,'희소','mountain',85),
('낚싯대','🏅','스포츠',176000,true,'희소','street',85),
('당구큐','🏅','스포츠',204000,false,'진귀','alley',45),
('양궁활','🏅','스포츠',299000,false,'진귀','mountain',45),
('승마헬멧','🏅','스포츠',394000,false,'진귀','street',45),
('크리켓배트','🏅','스포츠',536000,false,'보물','alley',20),
('하키스틱','🏅','스포츠',1190000,false,'전설','mountain',8),
('캔버스텐트','⛺','캠핑',82000,true,'일반','mountain',130),
('침낭','⛺','캠핑',114000,true,'일반','street',130),
('야전침대','⛺','캠핑',78000,true,'일반','alley',130),
('캠핑의자','⛺','캠핑',110000,true,'일반','mountain',130),
('코펠세트','⛺','캠핑',73000,true,'일반','street',130),
('버너','⛺','캠핑',105000,true,'일반','alley',130),
('아이스박스','⛺','캠핑',69000,true,'일반','mountain',130),
('랜턴스탠드','⛺','캠핑',101000,true,'일반','street',130),
('등산배낭','⛺','캠핑',133000,true,'일반','alley',130),
('등산스틱','⛺','캠핑',96000,true,'일반','mountain',130),
('나침반','⛺','캠핑',231000,true,'희소','street',85),
('수통','⛺','캠핑',165000,true,'희소','alley',85),
('멀티툴','⛺','캠핑',222000,true,'희소','mountain',85),
('휴대용망원경','⛺','캠핑',156000,true,'희소','street',85),
('해먹','⛺','캠핑',214000,true,'희소','alley',85),
('피크닉바구니','⛺','캠핑',264000,false,'진귀','mountain',45),
('방수포','⛺','캠핑',366000,false,'진귀','street',45),
('숯불화로','⛺','캠핑',249000,false,'진귀','alley',45),
('주전자세트','⛺','캠핑',659000,false,'보물','mountain',20),
('캠핑테이블','⛺','캠핑',732000,false,'전설','street',8),
('목수망치','🔧','공구',103000,true,'일반','street',130),
('몽키스패너','🔧','공구',137000,true,'일반','alley',130),
('파이프렌치','🔧','공구',98000,true,'일반','mountain',130),
('수동드릴','🔧','공구',132000,true,'일반','street',130),
('대패','🔧','공구',93000,true,'일반','alley',130),
('끌세트','🔧','공구',127000,true,'일반','mountain',130),
('톱','🔧','공구',88000,true,'일반','street',130),
('볼트커터','🔧','공구',122000,true,'일반','alley',130),
('펜치','🔧','공구',83000,true,'일반','mountain',130),
('니퍼','🔧','공구',118000,true,'일반','street',130),
('줄자','🔧','공구',141000,true,'희소','alley',85),
('수평계','🔧','공구',203000,true,'희소','mountain',85),
('납땜인두','🔧','공구',132000,true,'희소','street',85),
('바이스','🔧','공구',194000,true,'희소','alley',85),
('목공클램프','🔧','공구',256000,true,'희소','mountain',85),
('렌치세트','🔧','공구',329000,false,'진귀','street',45),
('정밀드라이버','🔧','공구',439000,false,'진귀','alley',45),
('전동드릴','🔧','공구',314000,false,'진귀','mountain',45),
('작업용랜턴','🔧','공구',794000,false,'보물','street',20),
('공구함','🔧','공구',931000,false,'전설','alley',8),
('만년필','✒️','문구',125000,true,'일반','alley',130),
('잉크병','✒️','문구',84000,true,'일반','mountain',130),
('샤프펜슬','✒️','문구',120000,true,'일반','street',130),
('제도컴퍼스','✒️','문구',78000,true,'일반','alley',130),
('가죽필통','✒️','문구',115000,true,'일반','mountain',130),
('스탬프세트','✒️','문구',152000,true,'일반','street',130),
('편지칼','✒️','문구',110000,true,'일반','alley',130),
('봉인인장','✒️','문구',146000,true,'일반','mountain',130),
('탁상연필깎이','✒️','문구',104000,true,'일반','street',130),
('타자기리본','✒️','문구',141000,true,'일반','alley',130),
('원고지묶음','✒️','문구',179000,true,'희소','mountain',85),
('목제자','✒️','문구',245000,true,'희소','street',85),
('제도판','✒️','문구',169000,true,'희소','alley',85),
('책갈피','✒️','문구',235000,true,'희소','mountain',85),
('가죽수첩','✒️','문구',160000,true,'희소','street',85),
('메모홀더','✒️','문구',401000,false,'진귀','alley',45),
('종이압착기','✒️','문구',268000,false,'진귀','mountain',45),
('금속클립통','✒️','문구',385000,false,'진귀','street',45),
('붓통','✒️','문구',470000,false,'보물','alley',20),
('문진','✒️','문구',1150000,false,'전설','mountain',8),
('초판소설','📚','도서',150000,true,'일반','mountain',130),
('고지도도감','📚','도서',105000,true,'일반','street',130),
('식물도감','📚','도서',144000,true,'일반','alley',130),
('천문학책','📚','도서',100000,true,'일반','mountain',130),
('요리책','📚','도서',139000,true,'일반','street',130),
('사진집','📚','도서',94000,true,'일반','alley',130),
('미술화집','📚','도서',133000,true,'일반','mountain',130),
('건축설계집','📚','도서',89000,true,'일반','street',130),
('철도시간표','📚','도서',128000,true,'일반','alley',130),
('여행일지','📚','도서',83000,true,'일반','mountain',130),
('항해일지','📚','도서',220000,true,'희소','street',85),
('백과사전','📚','도서',290000,true,'희소','alley',85),
('국어사전','📚','도서',210000,true,'희소','mountain',85),
('악보집','📚','도서',280000,true,'희소','street',85),
('만화단행본','📚','도서',200000,true,'희소','alley',85),
('전쟁회고록','📚','도서',480000,false,'진귀','mountain',45),
('고전시집','📚','도서',337000,false,'진귀','street',45),
('희곡집','📚','도서',462000,false,'진귀','alley',45),
('과학잡지합본','📚','도서',599000,false,'보물','mountain',20),
('신문스크랩북','📚','도서',1388000,false,'전설','street',8),
('곰인형','🧸','완구',88000,true,'일반','street',130),
('태엽로봇','🧸','완구',129000,true,'일반','alley',130),
('주석자동차','🧸','완구',170000,true,'일반','mountain',130),
('목마','🧸','완구',123000,true,'일반','street',130),
('기차모형','🧸','완구',164000,true,'일반','alley',130),
('인형의집','🧸','완구',118000,true,'일반','mountain',130),
('마리오네트','🧸','완구',159000,true,'일반','street',130),
('요요','🧸','완구',112000,true,'일반','alley',130),
('팽이','🧸','완구',153000,true,'일반','mountain',130),
('구슬세트','🧸','완구',106000,true,'일반','street',130),
('종이인형','🧸','완구',264000,true,'희소','alley',85),
('목제블록','🧸','완구',180000,true,'희소','mountain',85),
('미니어처병정','🧸','완구',254000,true,'희소','street',85),
('고무오리','🧸','완구',169000,true,'희소','alley',85),
('만화경','🧸','완구',243000,true,'희소','mountain',85),
('손가락인형','🧸','완구',282000,false,'진귀','street',45),
('오르골인형','🧸','완구',414000,false,'진귀','alley',45),
('우주선모형','🧸','완구',545000,false,'진귀','mountain',45),
('서커스장난감','🧸','완구',740000,false,'보물','street',20),
('바람개비','🧸','완구',1645000,false,'전설','alley',8),
('8비트게임기','🎮','게임',112000,true,'일반','alley',130),
('16비트게임기','🎮','게임',155000,true,'일반','mountain',130),
('휴대용게임기','🎮','게임',105000,true,'일반','street',130),
('아케이드조이스틱','🎮','게임',149000,true,'일반','alley',130),
('게임카트리지','🎮','게임',99000,true,'일반','mountain',130),
('보드게임세트','🎮','게임',143000,true,'일반','street',130),
('체스세트','🎮','게임',93000,true,'일반','alley',130),
('장기판','🎮','게임',136000,true,'일반','mountain',130),
('바둑판','🎮','게임',180000,true,'일반','street',130),
('다트보드','🎮','게임',130000,true,'일반','alley',130),
('핀볼미니어처','🎮','게임',312000,true,'희소','mountain',85),
('카드덱','🎮','게임',223000,true,'희소','street',85),
('주사위세트','🎮','게임',301000,true,'희소','alley',85),
('퍼즐상자','🎮','게임',212000,true,'희소','mountain',85),
('마작패','🎮','게임',290000,true,'희소','street',85),
('룰렛세트','🎮','게임',357000,false,'진귀','alley',45),
('미니당구대','🎮','게임',496000,false,'진귀','mountain',45),
('전자오락기','🎮','게임',337000,false,'진귀','street',45),
('게임공략집','🎮','게임',893000,false,'보물','alley',20),
('한정판컨트롤러','🎮','게임',992000,false,'전설','mountain',8),
('통기타','🎸','악기',137000,true,'일반','mountain',130),
('클래식기타','🎸','악기',183000,true,'일반','street',130),
('일렉트릭기타','🎸','악기',130000,true,'일반','alley',130),
('우쿨렐레','🎸','악기',176000,true,'일반','mountain',130),
('바이올린','🎸','악기',124000,true,'일반','street',130),
('첼로','🎸','악기',170000,true,'일반','alley',130),
('트럼펫','🎸','악기',117000,true,'일반','mountain',130),
('색소폰','🎸','악기',163000,true,'일반','street',130),
('하모니카','🎸','악기',111000,true,'일반','alley',130),
('아코디언','🎸','악기',157000,true,'일반','mountain',130),
('플루트','🎸','악기',188000,true,'희소','street',85),
('클라리넷','🎸','악기',270000,true,'희소','alley',85),
('만돌린','🎸','악기',176000,true,'희소','mountain',85),
('밴조','🎸','악기',258000,true,'희소','street',85),
('탬버린','🎸','악기',341000,true,'희소','alley',85),
('스네어드럼','🎸','악기',438000,false,'진귀','mountain',45),
('오카리나','🎸','악기',585000,false,'진귀','street',45),
('칼림바','🎸','악기',418000,false,'진귀','alley',45),
('멜로디언','🎸','악기',1057000,false,'보물','mountain',20),
('뮤직박스','🎸','악기',1240000,false,'전설','street',8),
('유화풍경화','🖼️','미술품',164000,true,'일반','street',130),
('수채화정물화','🖼️','미술품',110000,true,'일반','alley',130),
('목탄인물화','🖼️','미술품',158000,true,'일반','mountain',130),
('판화','🖼️','미술품',103000,true,'일반','street',130),
('석판화','🖼️','미술품',151000,true,'일반','alley',130),
('동판화','🖼️','미술품',199000,true,'일반','mountain',130),
('민화','🖼️','미술품',144000,true,'일반','street',130),
('서예족자','🖼️','미술품',192000,true,'일반','alley',130),
('자수액자','🖼️','미술품',137000,true,'일반','mountain',130),
('모자이크패널','🖼️','미술품',185000,true,'일반','street',130),
('추상화','🖼️','미술품',234000,true,'희소','alley',85),
('초상화','🖼️','미술품',321000,true,'희소','mountain',85),
('해양화','🖼️','미술품',222000,true,'희소','street',85),
('도시스케치','🖼️','미술품',308000,true,'희소','alley',85),
('식물세밀화','🖼️','미술품',210000,true,'희소','mountain',85),
('인쇄포스터','🖼️','미술품',526000,false,'진귀','street',45),
('광고삽화','🖼️','미술품',351000,false,'진귀','alley',45),
('무대디자인화','🖼️','미술품',504000,false,'진귀','mountain',45),
('영화콘셉트화','🖼️','미술품',616000,false,'보물','street',20),
('지도일러스트','🖼️','미술품',1507000,false,'전설','alley',8),
('백자항아리','🏺','도자기',194000,true,'일반','alley',130),
('청자매병','🏺','도자기',136000,true,'일반','mountain',130),
('분청사기접시','🏺','도자기',187000,true,'일반','street',130),
('철화병','🏺','도자기',129000,true,'일반','alley',130),
('도자기찻잔','🏺','도자기',179000,true,'일반','mountain',130),
('도자기주병','🏺','도자기',122000,true,'일반','street',130),
('도자기향로','🏺','도자기',172000,true,'일반','alley',130),
('도자기촛대','🏺','도자기',115000,true,'일반','mountain',130),
('도자기인형','🏺','도자기',165000,true,'일반','street',130),
('도자기화병','🏺','도자기',108000,true,'일반','alley',130),
('도자기합','🏺','도자기',284000,true,'희소','mountain',85),
('도자기필통','🏺','도자기',375000,true,'희소','street',85),
('도자기벼루','🏺','도자기',271000,true,'희소','alley',85),
('도자기술잔','🏺','도자기',362000,true,'희소','mountain',85),
('도자기연적','🏺','도자기',258000,true,'희소','street',85),
('도자기사발','🏺','도자기',620000,false,'진귀','alley',45),
('도자기단지','🏺','도자기',436000,false,'진귀','mountain',45),
('도자기접시','🏺','도자기',597000,false,'진귀','street',45),
('도자기장식판','🏺','도자기',775000,false,'보물','alley',20),
('도자기수반','🏺','도자기',1794000,false,'전설','mountain',8),
('오래된동전','🏺','골동품',112000,true,'일반','mountain',130),
('청동거울','🏺','골동품',165000,true,'일반','street',130),
('황동나침반','🏺','골동품',218000,true,'일반','alley',130),
('은제촛대','🏺','골동품',158000,true,'일반','mountain',130),
('목제경전함','🏺','골동품',210000,true,'일반','street',130),
('놋쇠주전자','🏺','골동품',150000,true,'일반','alley',130),
('철제자물쇠','🏺','골동품',202000,true,'일반','mountain',130),
('고대열쇠','🏺','골동품',142000,true,'일반','street',130),
('상아색부채','🏺','골동품',195000,true,'일반','alley',130),
('목각가면','🏺','골동품',135000,true,'일반','mountain',130),
('청동종','🏺','골동품',338000,true,'희소','street',85),
('은제담배갑','🏺','골동품',230000,true,'희소','alley',85),
('황동망원경','🏺','골동품',324000,true,'희소','mountain',85),
('구식계산기','🏺','골동품',216000,true,'희소','street',85),
('수동전화교환기','🏺','골동품',310000,true,'희소','alley',85),
('철도승차권펀치','🏺','골동품',360000,false,'진귀','mountain',45),
('우편저울','🏺','골동품',528000,false,'진귀','street',45),
('상점계산대','🏺','골동품',696000,false,'진귀','alley',45),
('해군육분의','🏺','골동품',945000,false,'보물','mountain',20),
('고전식금고','🏺','골동품',2100000,false,'전설','street',8),
('기념우표첩','✨','수집품',141000,true,'일반','street',130),
('야구카드','✨','수집품',196000,true,'일반','alley',130),
('영화포스터','✨','수집품',133000,true,'일반','mountain',130),
('콘서트티켓','✨','수집품',188000,true,'일반','street',130),
('맥주병라벨','✨','수집품',125000,true,'일반','alley',130),
('성냥갑컬렉션','✨','수집품',180000,true,'일반','mountain',130),
('병뚜껑컬렉션','✨','수집품',117000,true,'일반','street',130),
('여행엽서','✨','수집품',172000,true,'일반','alley',130),
('기념배지','✨','수집품',227000,true,'일반','mountain',130),
('군용패치','✨','수집품',164000,true,'일반','street',130),
('철도모형','✨','수집품',394000,true,'희소','alley',85),
('자동차미니어처','✨','수집품',282000,true,'희소','mountain',85),
('선박모형','✨','수집품',380000,true,'희소','street',85),
('비행기모형','✨','수집품',268000,true,'희소','alley',85),
('한정판피규어','✨','수집품',366000,true,'희소','mountain',85),
('사인볼','✨','수집품',451000,false,'진귀','street',45),
('기념주화','✨','수집품',626000,false,'진귀','alley',45),
('빈티지광고판','✨','수집품',426000,false,'진귀','mountain',45),
('레코드판','✨','수집품',1127000,false,'보물','street',20),
('희귀만화책','✨','수집품',1252000,false,'전설','alley',8),
('자수정원석','💎','광물',171000,true,'일반','alley',130),
('석영결정','💎','광물',228000,true,'일반','mountain',130),
('흑요석','💎','광물',163000,true,'일반','street',130),
('황철석','💎','광물',220000,true,'일반','alley',130),
('공작석','💎','광물',155000,true,'일반','mountain',130),
('청금석','💎','광물',212000,true,'일반','street',130),
('마노','💎','광물',147000,true,'일반','alley',130),
('형석','💎','광물',204000,true,'일반','mountain',130),
('방해석','💎','광물',139000,true,'일반','street',130),
('석류석','💎','광물',196000,true,'일반','alley',130),
('전기석','💎','광물',235000,true,'희소','mountain',85),
('월장석','💎','광물',337000,true,'희소','street',85),
('장석','💎','광물',220000,true,'희소','alley',85),
('운모표본','💎','광물',323000,true,'희소','mountain',85),
('암모나이트화석','💎','광물',425000,true,'희소','street',85),
('삼엽충화석','💎','광물',548000,false,'진귀','alley',45),
('운석조각','💎','광물',730000,false,'진귀','mountain',45),
('호박원석','💎','광물',522000,false,'진귀','street',45),
('공룡이빨화석','💎','광물',1320000,false,'보물','alley',20),
('수정동굴표본','💎','광물',1548000,false,'전설','mountain',8),
('루비반지','💍','보석',203000,true,'일반','mountain',130),
('사파이어목걸이','💍','보석',136000,true,'일반','street',130),
('에메랄드브로치','💍','보석',195000,true,'일반','alley',130),
('오팔귀걸이','💍','보석',127000,true,'일반','mountain',130),
('진주목걸이','💍','보석',186000,true,'일반','street',130),
('가넷반지','💍','보석',246000,true,'일반','alley',130),
('토파즈펜던트','💍','보석',178000,true,'일반','mountain',130),
('자수정브로치','💍','보석',237000,true,'일반','street',130),
('호박팔찌','💍','보석',170000,true,'일반','alley',130),
('문스톤반지','💍','보석',229000,true,'일반','mountain',130),
('터키석목걸이','💍','보석',290000,true,'희소','street',85),
('산호귀걸이','💍','보석',397000,true,'희소','alley',85),
('라피스인장반지','💍','보석',275000,true,'희소','mountain',85),
('스피넬펜던트','💍','보석',381000,true,'희소','street',85),
('아쿠아마린브로치','💍','보석',259000,true,'희소','alley',85),
('페리도트반지','💍','보석',651000,false,'진귀','mountain',45),
('시트린목걸이','💍','보석',434000,false,'진귀','street',45),
('제이드팔찌','💍','보석',624000,false,'진귀','alley',45),
('은제보석함','💍','보석',763000,false,'보물','mountain',20),
('금제로켓','💍','보석',1865000,false,'전설','street',8),
('가죽운전장갑','🚗','차량용품',238000,true,'일반','street',130),
('클래식핸들','🚗','차량용품',167000,true,'일반','alley',130),
('자동차엠블럼','🚗','차량용품',229000,true,'일반','mountain',130),
('오래된번호판','🚗','차량용품',158000,true,'일반','street',130),
('차량용라디오','🚗','차량용품',220000,true,'일반','alley',130),
('대시보드시계','🚗','차량용품',150000,true,'일반','mountain',130),
('사이드미러','🚗','차량용품',211000,true,'일반','street',130),
('기어노브','🚗','차량용품',141000,true,'일반','alley',130),
('후드장식','🚗','차량용품',202000,true,'일반','mountain',130),
('자동차매뉴얼','🚗','차량용품',132000,true,'일반','street',130),
('휴대용공기주입기','🚗','차량용품',348000,true,'희소','alley',85),
('점프케이블','🚗','차량용품',459000,true,'희소','mountain',85),
('정비공구세트','🚗','차량용품',333000,true,'희소','street',85),
('오일캔','🚗','차량용품',444000,true,'희소','alley',85),
('자동차모형키','🚗','차량용품',317000,true,'희소','mountain',85),
('택시미터기','🚗','차량용품',760000,false,'진귀','street',45),
('버스안내판','🚗','차량용품',535000,false,'진귀','alley',45),
('차량용재떨이','🚗','차량용품',732000,false,'진귀','mountain',45),
('루프캐리어','🚗','차량용품',950000,false,'보물','street',20),
('빈티지헬멧','🚗','차량용품',2200000,false,'전설','alley',8)
on conflict(name) do update set icon=excluded.icon,category=excluded.category,average_price=excluded.average_price,is_average_price_known=excluded.is_average_price_known,rarity=excluded.rarity,location=excluded.location,find_weight=excluded.find_weight;

select count(*) as total_trade_items from public.items;
