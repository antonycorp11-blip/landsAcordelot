-- Lands of Acordelot — save na nuvem.
--
-- Uma linha por jogador. O save inteiro vai como jsonb porque o formato muda
-- a cada versão do jogo e não vale a pena espelhar aqui um esquema que o
-- cliente já sabe ler; `saved_at` fica em coluna própria porque é o único
-- campo que o servidor precisa comparar.

create table if not exists public.saves (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  slot       text not null default 'main',
  payload    jsonb not null,
  -- Carimbo do cliente, em milissegundos. É por ele que se decide quem vence
  -- quando o celular e o navegador gravaram versões diferentes.
  saved_at   bigint not null,
  updated_at timestamptz not null default now()
);

-- Sem isto, qualquer pessoa com a chave publicável lê e apaga o save de todo
-- mundo. A chave anon é pública de propósito; quem protege os dados é o RLS.
alter table public.saves enable row level security;

drop policy if exists "cada um lê o próprio save" on public.saves;
create policy "cada um lê o próprio save"
  on public.saves for select
  using (auth.uid() = user_id);

drop policy if exists "cada um grava o próprio save" on public.saves;
create policy "cada um grava o próprio save"
  on public.saves for insert
  with check (auth.uid() = user_id);

drop policy if exists "cada um atualiza o próprio save" on public.saves;
create policy "cada um atualiza o próprio save"
  on public.saves for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Gravação mais antiga nunca sobrescreve uma mais nova. A regra é a mesma que
-- o cliente já usa entre IndexedDB e localStorage, aplicada também no servidor
-- para que dois aparelhos abertos ao mesmo tempo não se atropelem.
create or replace function public.save_if_newer(p_payload jsonb, p_saved_at bigint)
returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_current bigint;
begin
  select saved_at into v_current from public.saves where user_id = auth.uid();

  if v_current is null then
    insert into public.saves (user_id, payload, saved_at)
    values (auth.uid(), p_payload, p_saved_at);
    return p_saved_at;
  end if;

  if p_saved_at > v_current then
    update public.saves
       set payload = p_payload, saved_at = p_saved_at, updated_at = now()
     where user_id = auth.uid();
    return p_saved_at;
  end if;

  -- O servidor tinha algo mais novo: devolve o carimbo dele para o cliente
  -- saber que precisa baixar em vez de insistir.
  return v_current;
end;
$$;

revoke all on function public.save_if_newer(jsonb, bigint) from public;
grant execute on function public.save_if_newer(jsonb, bigint) to authenticated;
