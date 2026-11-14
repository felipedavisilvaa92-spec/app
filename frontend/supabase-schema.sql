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
  number integer not null, comprador text not null, separador text not null, status text not null default 'aberto' check(status in ('aberto','finalizado','cancelado')),
  created_at timestamptz not null default now(), finalized_at timestamptz, unique(shop_id,number)
);
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

-- Convite por e-mail: vincula imediatamente usuário já existente, senão o trigger o vincula no cadastro.
create or replace function public.authorize_shop_email(p_email text) returns void language plpgsql security definer set search_path=public as $$ declare sid uuid; uid uuid; normalized text:=lower(trim(p_email)); begin select shop_id into sid from shop_members where user_id=auth.uid() and role='owner'; if sid is null then raise exception 'Somente o dono pode autorizar e-mails'; end if; if normalized='' then raise exception 'E-mail inválido'; end if; insert into authorized_emails(shop_id,email) values(sid,normalized); select id into uid from auth.users where lower(email)=normalized; if uid is not null then insert into shop_members(shop_id,user_id,role) values(sid,uid,'member') on conflict(user_id) do nothing; end if; end; $$;
create or replace function public.attach_authorized_email() returns trigger language plpgsql security definer set search_path=public as $$ declare sid uuid; begin select shop_id into sid from authorized_emails where email=lower(new.email); if sid is not null then insert into shop_members(shop_id,user_id,role) values(sid,new.id,'member') on conflict(user_id) do nothing; end if; return new; end; $$;
drop trigger if exists attach_authorized_email_on_signup on auth.users;
create trigger attach_authorized_email_on_signup after insert on auth.users for each row execute function public.attach_authorized_email();

create or replace function public.record_stock_movement(p_shop_id uuid,p_item_id text,p_product_type text,p_color text,p_size text,p_kind text,p_quantity integer,p_note text default null,p_order_number integer default null) returns public.movements language plpgsql security invoker set search_path=public as $$ declare current_qty integer; result public.movements; begin if not is_shop_member(p_shop_id) then raise exception 'Sem acesso à loja'; end if; if p_quantity<=0 or p_kind not in ('entrada','saida') then raise exception 'Movimentação inválida'; end if; insert into stock_items(shop_id,item_id,product_type,color,size,quantity) values(p_shop_id,p_item_id,p_product_type,p_color,p_size,0) on conflict do nothing; select quantity into current_qty from stock_items where shop_id=p_shop_id and item_id=p_item_id for update; if p_kind='saida' and current_qty<p_quantity then raise exception 'Quantidade de saída maior que o estoque disponível'; end if; update stock_items set quantity=case when p_kind='entrada' then quantity+p_quantity else quantity-p_quantity end,updated_at=now() where shop_id=p_shop_id and item_id=p_item_id; insert into movements(shop_id,item_id,product_type,color,size,kind,quantity,note,order_number) values(p_shop_id,p_item_id,p_product_type,p_color,p_size,p_kind,p_quantity,p_note,p_order_number) returning * into result; return result; end; $$;
create or replace function public.finalize_stock_order(p_shop_id uuid,p_order_id uuid) returns jsonb language plpgsql security invoker set search_path=public as $$ declare ord orders; item order_items; insufficient text[]:='{}'; begin if not is_shop_member(p_shop_id) then raise exception 'Sem acesso à loja'; end if; select * into ord from orders where id=p_order_id and shop_id=p_shop_id for update; if not found or ord.status<>'aberto' then raise exception 'Pedido não encontrado ou já finalizado'; end if; if not exists(select 1 from order_items where order_id=p_order_id and picked) then raise exception 'Marque ao menos um item como separado'; end if; for item in select * from order_items where order_id=p_order_id and picked loop perform 1 from stock_items where shop_id=p_shop_id and item_id=item.item_id for update; if coalesce((select quantity from stock_items where shop_id=p_shop_id and item_id=item.item_id),0)<item.quantity then insufficient:=array_append(insufficient,item.product_type||' '||item.color||' '||item.size); end if; end loop; if cardinality(insufficient)>0 then raise exception 'Estoque insuficiente: %',array_to_string(insufficient,', '); end if; for item in select * from order_items where order_id=p_order_id and picked loop perform record_stock_movement(p_shop_id,item.item_id,item.product_type,item.color,item.size,'saida',item.quantity,'Pedido #'||lpad(ord.number::text,3,'0')||' · '||ord.comprador,ord.number); end loop; update orders set status='finalizado',finalized_at=now() where id=p_order_id; return (select to_jsonb(o)||jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(i)) from order_items i where i.order_id=o.id),'[]'::jsonb)) from orders o where o.id=p_order_id); end; $$;

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
grant execute on function public.get_my_shop() to authenticated; grant execute on function public.create_my_shop(text) to authenticated; grant execute on function public.authorize_shop_email(text) to authenticated; grant execute on function public.record_stock_movement(uuid,text,text,text,text,text,integer,text,integer) to authenticated; grant execute on function public.finalize_stock_order(uuid,uuid) to authenticated;
