-- Maré: execute somente em um projeto Supabase NOVO e exclusivo.
create extension if not exists pgcrypto;
create table public.imoveis (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 codigo text not null, titulo text not null, bairro text, cidade text not null default 'São Sebastião', uf text not null default 'SP',
 capacidade integer not null default 0 check(capacidade>=0), dormitorios integer not null default 0 check(dormitorios>=0), suites integer not null default 0 check(suites>=0),
 camas jsonb not null default '[]'::jsonb, piscina boolean not null default false, churrasqueira boolean not null default false,
 area_gourmet boolean not null default false, servico_praia boolean not null default false, distancia_praia integer check(distancia_praia is null or distancia_praia>=0),
 descricao text, url_origem text, disponibilidade_status text not null default 'a_confirmar' check(disponibilidade_status in('a_confirmar','disponivel','reservado','indisponivel')),
 ativo boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id,codigo)
);
create table public.fotos_imovel (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 imovel_id uuid not null references public.imoveis(id) on delete cascade, url text not null, cloudinary_public_id text, legenda text,
 ordem integer not null default 0, capa boolean not null default false, created_at timestamptz not null default now()
);
create table public.periodos (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 nome text not null, data_inicio date not null, data_fim date not null, observacao text, created_at timestamptz not null default now(), check(data_fim>data_inicio)
);
create table public.precos_imovel (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 imovel_id uuid not null references public.imoveis(id) on delete cascade, tipo text not null check(tipo in('diaria','pacote')),
 nome_periodo text, data_inicio date, data_fim date, valor numeric(12,2) not null check(valor>0), noites_minimas integer not null default 1 check(noites_minimas>=1),
 observacao text, created_at timestamptz not null default now(),
 check((data_inicio is null and data_fim is null) or (data_inicio is not null and data_fim is not null and data_fim>data_inicio)),
 check(tipo<>'pacote' or (data_inicio is not null and data_fim is not null and nome_periodo is not null))
);
create table public.importacoes (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 origem_tipo text not null check(origem_tipo in('texto','url')), url_origem text, texto_original text, dados_extraidos jsonb not null default '{}'::jsonb,
 status text not null default 'revisao' check(status in('revisao','concluida','falha')), erro text,
 imovel_id uuid references public.imoveis(id) on delete set null, created_at timestamptz not null default now()
);
create table public.ofertas (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 cliente_nome text, data_inicio date not null, data_fim date not null, hospedes integer not null default 1 check(hospedes>0),
 mensagem text not null default '', status text not null default 'rascunho' check(status in('rascunho','enviada','arquivada')),
 created_at timestamptz not null default now(), check(data_fim>data_inicio)
);
create table public.oferta_imoveis (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 oferta_id uuid not null references public.ofertas(id) on delete cascade, imovel_id uuid not null references public.imoveis(id) on delete restrict,
 valor_calculado numeric(12,2), imovel_snapshot jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), unique(oferta_id,imovel_id)
);
create index imoveis_user_ativo_idx on public.imoveis(user_id,ativo);
create index fotos_imovel_lookup_idx on public.fotos_imovel(user_id,imovel_id,ordem);
create index precos_imovel_lookup_idx on public.precos_imovel(user_id,imovel_id,tipo,data_inicio,data_fim);
create index ofertas_user_date_idx on public.ofertas(user_id,created_at desc);
create index importacoes_user_date_idx on public.importacoes(user_id,created_at desc);
alter table public.imoveis enable row level security;
alter table public.fotos_imovel enable row level security;
alter table public.periodos enable row level security;
alter table public.precos_imovel enable row level security;
alter table public.importacoes enable row level security;
alter table public.ofertas enable row level security;
alter table public.oferta_imoveis enable row level security;
create policy "mare_imoveis_owner" on public.imoveis for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy "mare_fotos_owner" on public.fotos_imovel for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy "mare_periodos_owner" on public.periodos for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy "mare_precos_owner" on public.precos_imovel for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy "mare_importacoes_owner" on public.importacoes for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy "mare_ofertas_owner" on public.ofertas for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy "mare_oferta_imoveis_owner" on public.oferta_imoveis for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
grant select,insert,update,delete on public.imoveis,public.fotos_imovel,public.periodos,public.precos_imovel,public.importacoes,public.ofertas,public.oferta_imoveis to authenticated;
