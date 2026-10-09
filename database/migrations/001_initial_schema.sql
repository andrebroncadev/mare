-- Maré: tabelas isoladas com prefixo mare_ para coexistir temporariamente com outros sistemas.
create extension if not exists pgcrypto;
create table public.mare_imoveis (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 codigo text not null, titulo text not null, bairro text, cidade text not null default 'São Sebastião', uf text not null default 'SP',
 capacidade integer not null default 0 check(capacidade>=0), dormitorios integer not null default 0 check(dormitorios>=0), suites integer not null default 0 check(suites>=0),
 camas jsonb not null default '[]'::jsonb, piscina boolean not null default false, churrasqueira boolean not null default false,
 area_gourmet boolean not null default false, servico_praia boolean not null default false, distancia_praia integer check(distancia_praia is null or distancia_praia>=0),
 descricao text, url_origem text, disponibilidade_status text not null default 'a_confirmar' check(disponibilidade_status in('a_confirmar','disponivel','reservado','indisponivel')),
 ativo boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id,codigo)
);
create table public.mare_fotos_imovel (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 imovel_id uuid not null references public.mare_imoveis(id) on delete cascade, url text not null, cloudinary_public_id text, legenda text,
 ordem integer not null default 0, capa boolean not null default false, created_at timestamptz not null default now()
);
create table public.mare_periodos (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 nome text not null, data_inicio date not null, data_fim date not null, observacao text, created_at timestamptz not null default now(), check(data_fim>data_inicio)
);
create table public.mare_precos_imovel (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 imovel_id uuid not null references public.mare_imoveis(id) on delete cascade, tipo text not null check(tipo in('diaria','pacote')),
 nome_periodo text, data_inicio date, data_fim date, valor numeric(12,2) not null check(valor>0), noites_minimas integer not null default 1 check(noites_minimas>=1),
 observacao text, created_at timestamptz not null default now(),
 check((data_inicio is null and data_fim is null) or (data_inicio is not null and data_fim is not null and data_fim>data_inicio)),
 check(tipo<>'pacote' or (data_inicio is not null and data_fim is not null and nome_periodo is not null))
);
create table public.mare_importacoes (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 origem_tipo text not null check(origem_tipo in('texto','url')), url_origem text, texto_original text, dados_extraidos jsonb not null default '{}'::jsonb,
 status text not null default 'revisao' check(status in('revisao','concluida','falha')), erro text,
 imovel_id uuid references public.mare_imoveis(id) on delete set null, created_at timestamptz not null default now()
);
create table public.mare_ofertas (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 cliente_nome text, data_inicio date not null, data_fim date not null, hospedes integer not null default 1 check(hospedes>0),
 mensagem text not null default '', status text not null default 'rascunho' check(status in('rascunho','enviada','arquivada')),
 created_at timestamptz not null default now(), check(data_fim>data_inicio)
);
create table public.mare_oferta_imoveis (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 oferta_id uuid not null references public.mare_ofertas(id) on delete cascade, imovel_id uuid not null references public.mare_imoveis(id) on delete restrict,
 valor_calculado numeric(12,2), imovel_snapshot jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), unique(oferta_id,imovel_id)
);
create index mare_imoveis_user_ativo_idx on public.mare_imoveis(user_id,ativo);
create index mare_fotos_imovel_lookup_idx on public.mare_fotos_imovel(user_id,imovel_id,ordem);
create index mare_precos_imovel_lookup_idx on public.mare_precos_imovel(user_id,imovel_id,tipo,data_inicio,data_fim);
create index mare_ofertas_user_date_idx on public.mare_ofertas(user_id,created_at desc);
create index mare_importacoes_user_date_idx on public.mare_importacoes(user_id,created_at desc);
alter table public.mare_imoveis enable row level security;
alter table public.mare_fotos_imovel enable row level security;
alter table public.mare_periodos enable row level security;
alter table public.mare_precos_imovel enable row level security;
alter table public.mare_importacoes enable row level security;
alter table public.mare_ofertas enable row level security;
alter table public.mare_oferta_imoveis enable row level security;
create policy "mare_imoveis_owner" on public.mare_imoveis for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy "mare_fotos_owner" on public.mare_fotos_imovel for all to authenticated using((select auth.uid())=user_id and exists(select 1 from public.mare_imoveis i where i.id=imovel_id and i.user_id=(select auth.uid()))) with check((select auth.uid())=user_id and exists(select 1 from public.mare_imoveis i where i.id=imovel_id and i.user_id=(select auth.uid())));
create policy "mare_periodos_owner" on public.mare_periodos for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy "mare_precos_owner" on public.mare_precos_imovel for all to authenticated using((select auth.uid())=user_id and exists(select 1 from public.mare_imoveis i where i.id=imovel_id and i.user_id=(select auth.uid()))) with check((select auth.uid())=user_id and exists(select 1 from public.mare_imoveis i where i.id=imovel_id and i.user_id=(select auth.uid())));
create policy "mare_importacoes_owner" on public.mare_importacoes for all to authenticated using((select auth.uid())=user_id and (imovel_id is null or exists(select 1 from public.mare_imoveis i where i.id=imovel_id and i.user_id=(select auth.uid())))) with check((select auth.uid())=user_id and (imovel_id is null or exists(select 1 from public.mare_imoveis i where i.id=imovel_id and i.user_id=(select auth.uid()))));
create policy "mare_ofertas_owner" on public.mare_ofertas for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy "mare_oferta_imoveis_owner" on public.mare_oferta_imoveis for all to authenticated using((select auth.uid())=user_id and exists(select 1 from public.mare_ofertas o where o.id=oferta_id and o.user_id=(select auth.uid())) and exists(select 1 from public.mare_imoveis i where i.id=imovel_id and i.user_id=(select auth.uid()))) with check((select auth.uid())=user_id and exists(select 1 from public.mare_ofertas o where o.id=oferta_id and o.user_id=(select auth.uid())) and exists(select 1 from public.mare_imoveis i where i.id=imovel_id and i.user_id=(select auth.uid())));
grant select,insert,update,delete on public.mare_imoveis,public.mare_fotos_imovel,public.mare_periodos,public.mare_precos_imovel,public.mare_importacoes,public.mare_ofertas,public.mare_oferta_imoveis to authenticated;
