create extension if not exists pgcrypto;

create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(), name text not null check (length(trim(name)) between 1 and 120), created_at timestamptz not null default now()
);
create table if not exists public.shop_members (
  shop_id uuid not null references public.shops(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','member')), created_at timestamptz not null default now(), primary key(shop_id,user_id), unique(user_id)
);
create table if not exists public.authorized_emails (
  id uuid primary key default gen_random_uuid(), shop_id uuid not null references public.shops(id) on delete cascade,
  email text not null, created_at timestamptz not null default now(), unique(shop_id,email), unique(email)
);
create table if not exists public.stock_items (
  shop_id uuid not null references public.shops(id) on delete cascade, item_id text not null, product_type text not null,
  color text not null, size text not null, quantity integer not null default 0 check(quantity>=0),
  created_at timestamptz not null default now(), updated_at timestamptz, primary key(shop_id,item_id)
);
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(), shop_id uuid not null references public.shops(id) on delete cascade,
  number integer not null, comprador text not null, separador text not null,
  created_by uuid references auth.users(id) on delete set null, created_by_email text,
  status text not null default 'aberto' check(status in ('aberto','finalizado','cancelado')),
  created_at timestamptz not null default now(), finalized_at timestamptz, unique(shop_id,number)
);
-- Apply these columns to databases that were created before per-user order tracking was added.
alter table public.orders add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.orders add column if not exists created_by_email text;
create index if not exists orders_shop_creator_status_idx on public.orders(shop_id,created_by,status);
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(), shop_id uuid not null references public.shops(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade, item_id text not null, product_type text not null,
  color text not null, size text not null, quantity integer not null check(quantity>0), picked boolean not null default false
);
create table if not exists public.movements (
  id uuid primary key default gen_random_uuid(), shop_id uuid not null references public.shops(id) on delete cascade,
  item_id text not null, product_type text not null, color text not null, size text not null,
  kind text not null check(kind in ('entrada','saida')), quantity integer not null check(quantity>0), note text,
  order_number integer, created_at timestamptz not null default now()
);
create index if not exists movements_shop_created_idx on public.movements(shop_id,created_at desc);

create or replace function public.is_shop_member(p_shop uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from shop_members where shop_id=p_shop and user_id=auth.uid()); $$;
create or replace function public.is_shop_owner(p_shop uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from shop_members where shop_id=p_shop and user_id=auth.uid() and role='owner'); $$;
revoke all on function public.is_shop_member(uuid) from public; grant execute on function public.is_shop_member(uuid) to authenticated;
revoke all on function public.is_shop_owner(uuid) from public; grant execute on function public.is_shop_owner(uuid) to authenticated;

create or replace function public.get_my_shop() returns table(shop_id uuid,shop_name text,role text) language sql stable security definer set search_path=public as $$ select s.id,s.name,m.role from shop_members m join shops s on s.id=m.shop_id where m.user_id=auth.uid() limit 1; $$;
create or replace function public.create_my_shop(p_name text) returns uuid language plpgsql security definer set search_path=public as $$ declare new_shop uuid; begin if auth.uid() is null then raise exception 'Autenticação necessária'; end if; if exists(select 1 from shop_members where user_id=auth.uid()) then raise exception 'Você já pertence a uma loja'; end if; insert into shops(name) values(trim(p_name)) returning id into new_shop; insert into shop_members(shop_id,user_id,role) values(new_shop,auth.uid(),'owner'); return new_shop; end; $$;

-- Locks the shop row while allocating the next number, so concurrent account creations cannot collide.
create or replace function public.create_shop_order(p_shop_id uuid, p_comprador text, p_separador text, p_created_by uuid, p_created_by_email text)
returns public.orders language plpgsql security invoker set search_path=public as $$
declare new_order public.orders; next_number integer;
begin
  if auth.uid() is null or p_created_by is distinct from auth.uid() then raise exception 'Conta inválida para criar o pedido'; end if;
  if not public.is_shop_member(p_shop_id) then raise exception 'Você não pertence a esta loja'; end if;
  perform 1 from public.shops where id=p_shop_id for update;
  if not found then raise exception 'Loja não encontrada'; end if;
  select coalesce(max(number),0)+1 into next_number from public.orders where shop_id=p_shop_id;
  insert into public.orders(shop_id,number,comprador,separador,created_by,created_by_email,status)
  values(p_shop_id,next_number,trim(p_comprador),trim(p_separador),auth.uid(),coalesce(nullif(trim(p_created_by_email),''),auth.jwt()->>'email'),'aberto')
  returning * into new_order;
  return new_order;
end; $$;

-- Convite por e-mail: vincula imediatamente usuário já existente, senão o trigger o vincula no cadastro.
create or replace function public.authorize_shop_email(p_email text) returns void language plpgsql security definer set search_path=public as $$ declare sid uuid; uid uuid; normalized text:=lower(trim(p_email)); begin select shop_id into sid from shop_members where user_id=auth.uid() and role='owner'; if sid is null then raise exception 'Somente o dono pode autorizar e-mails'; end if; if normalized='' then raise exception 'E-mail inválido'; end if; insert into authorized_emails(shop_id,email) values(sid,normalized); select id into uid from auth.users where lower(email)=normalized; if uid is not null then insert into shop_members(shop_id,user_id,role) values(sid,uid,'member') on conflict(user_id) do nothing; end if; end; $$;
create or replace function public.attach_authorized_email() returns trigger language plpgsql security definer set search_path=public as $$ declare sid uuid; begin select shop_id into sid from authorized_emails where email=lower(new.email); if sid is not null then insert into shop_members(shop_id,user_id,role) values(sid,new.id,'member') on conflict(user_id) do nothing; end if; return new; end; $$;
drop trigger if exists attach_authorized_email_on_signup on auth.users;
create trigger attach_authorized_email_on_signup after insert on auth.users for each row execute function public.attach_authorized_email();

create or replace function public.record_stock_movement(p_shop_id uuid,p_item_id text,p_product_type text,p_color text,p_size text,p_kind text,p_quantity integer,p_note text default null,p_order_number integer default null) returns uuid language plpgsql security invoker set search_path=public as $$ declare movement_id uuid; current_quantity integer; begin if not is_shop_member(p_shop_id) then raise exception 'Acesso negado'; end if; if p_kind='entrada' then update stock_items set quantity=quantity+p_quantity,updated_at=now() where shop_id=p_shop_id and item_id=p_item_id; else update stock_items set quantity=quantity-p_quantity,updated_at=now() where shop_id=p_shop_id and item_id=p_item_id and quantity>=p_quantity; end if; if not found then raise exception 'Estoque insuficiente ou item inexistente'; end if; insert into movements(shop_id,item_id,product_type,color,size,kind,quantity,note,order_number) values(p_shop_id,p_item_id,p_product_type,p_color,p_size,p_kind,p_quantity,p_note,p_order_number) returning id into movement_id; return movement_id; end; $$;
create or replace function public.finalize_stock_order(p_shop_id uuid,p_order_id uuid) returns jsonb language plpgsql security invoker set search_path=public as $$ declare ord orders; item order_items; begin if not is_shop_member(p_shop_id) then raise exception 'Acesso negado'; end if; select * into ord from orders where id=p_order_id and shop_id=p_shop_id for update; if not found or ord.status<>'aberto' then raise exception 'Pedido não encontrado ou já finalizado'; end if; for item in select * from order_items where order_id=p_order_id and shop_id=p_shop_id loop if not item.picked then raise exception 'Todos os itens precisam ser separados antes de finalizar'; end if; end loop; update orders set status='finalizado',finalized_at=now() where id=p_order_id returning * into ord; return to_jsonb(ord); end; $$;

alter table shops enable row level security; alter table shop_members enable row level security; alter table authorized_emails enable row level security; alter table stock_items enable row level security; alter table movements enable row level security; alter table orders enable row level security; alter table order_items enable row level security;
create policy shops_read_member on shops for select to authenticated using (is_shop_member(id));
create policy members_read_same_shop on shop_members for select to authenticated using (is_shop_member(shop_id));
create policy authorized_owner_all on authorized_emails for all to authenticated using(is_shop_owner(shop_id)) with check(is_shop_owner(shop_id));
create policy stock_member_all on stock_items for all to authenticated using(is_shop_member(shop_id)) with check(is_shop_member(shop_id));
create policy movements_member_read on movements for select to authenticated using(is_shop_member(shop_id));
create policy orders_member_all on orders for all to authenticated using(is_shop_member(shop_id)) with check(is_shop_member(shop_id));
create policy order_items_member_all on order_items for all to authenticated using(is_shop_member(shop_id)) with check(is_shop_member(shop_id));
grant select on shops,shop_members,authorized_emails,stock_items,movements,orders,order_items to authenticated;
grant insert,update,delete on authorized_emails,stock_items,orders,order_items to authenticated;
grant execute on function public.get_my_shop() to authenticated; grant execute on function public.create_my_shop(text) to authenticated; grant execute on function public.authorize_shop_email(text) to authenticated; grant execute on function public.create_shop_order(uuid,text,text,uuid,text) to authenticated; grant execute on function public.record_stock_movement(uuid,text,text,text,text,text,integer,text,integer) to authenticated; grant execute on function public.finalize_stock_order(uuid,uuid) to authenticated;
