-- Birlikte Puzzle — Supabase şeması
-- Kurulum: Supabase panelinde SQL Editor'ü açıp bu dosyanın tamamını çalıştırın.

-- ---------------------------------------------------------------- profiller

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Yeni kullanıcı kaydolunca profili otomatik oluştur
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- puzzle'lar

create table if not exists public.puzzles (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users on delete cascade,
  room_code text not null unique,
  title text not null default '',
  image_path text not null,
  seed bigint not null,
  piece_count int not null,
  message text not null default '',
  -- odaya aynı anda kaç kişi katılabilir
  max_players int not null default 2,
  -- parçalar rastgele açıyla mı başlıyor
  rotation boolean not null default false,
  -- doluysa puzzle bu zamana kadar kilitli
  unlock_at timestamptz,
  -- parça konumları (engine/state.ts -> StateSnapshot)
  state jsonb,
  elapsed int not null default 0,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Şema daha önce çalıştırıldıysa eksik sütunları tamamla
alter table public.puzzles add column if not exists title text not null default '';
alter table public.puzzles add column if not exists max_players int not null default 2;
alter table public.puzzles add column if not exists rotation boolean not null default false;
-- Özel gün puzzle'ı: bu zamana kadar kilitli kalır
alter table public.puzzles add column if not exists unlock_at timestamptz;

alter table public.puzzles enable row level security;

-- Ortak tablo: bir puzzle'a katılan herkes onu geçmişinde görür
create table if not exists public.puzzle_players (
  puzzle_id uuid not null references public.puzzles on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (puzzle_id, user_id)
);

alter table public.puzzle_players enable row level security;

create index if not exists puzzle_players_user_idx on public.puzzle_players (user_id);
create index if not exists puzzles_room_code_idx on public.puzzles (room_code);

-- ---------------------------------------------------------------- politikalar
-- Not: puzzles ve puzzle_players politikaları birbirine baksaydı RLS sonsuz
-- özyinelemeye girerdi; bu yüzden üyelik kontrolü security definer fonksiyonla
-- yapılıyor (fonksiyon RLS'i atlar).

create or replace function public.is_puzzle_player(p_puzzle uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.puzzle_players
    where puzzle_id = p_puzzle and user_id = auth.uid()
  );
$$;

-- profiller: herkes görebilir (partner adını göstermek için), kendini düzenler
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (true);

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- puzzle'lar: yalnızca katılımcılar görür ve günceller
drop policy if exists puzzles_select on public.puzzles;
create policy puzzles_select on public.puzzles
  for select to authenticated
  using (owner = auth.uid() or public.is_puzzle_player(id));

drop policy if exists puzzles_insert on public.puzzles;
create policy puzzles_insert on public.puzzles
  for insert to authenticated with check (owner = auth.uid());

drop policy if exists puzzles_update on public.puzzles;
create policy puzzles_update on public.puzzles
  for update to authenticated
  using (owner = auth.uid() or public.is_puzzle_player(id))
  with check (owner = auth.uid() or public.is_puzzle_player(id));

drop policy if exists puzzles_delete on public.puzzles;
create policy puzzles_delete on public.puzzles
  for delete to authenticated using (owner = auth.uid());

-- katılımcılar
drop policy if exists puzzle_players_select on public.puzzle_players;
create policy puzzle_players_select on public.puzzle_players
  for select to authenticated
  using (user_id = auth.uid() or public.is_puzzle_player(puzzle_id));

drop policy if exists puzzle_players_insert on public.puzzle_players;
create policy puzzle_players_insert on public.puzzle_players
  for insert to authenticated with check (user_id = auth.uid());

-- ------------------------------------------------- odaya katılma (kod ile)
-- Misafir yalnızca oda kodunu bilir. Doğrudan select yerine bu fonksiyon
-- kullanıcıyı katılımcı olarak ekler ve puzzle'ı döndürür.

create or replace function public.join_puzzle(p_code text)
returns public.puzzles
language plpgsql
security definer
set search_path = public
as $$
declare
  found_puzzle public.puzzles;
begin
  select * into found_puzzle from public.puzzles where room_code = p_code;
  if not found then
    raise exception 'oda bulunamadi';
  end if;

  insert into public.puzzle_players (puzzle_id, user_id)
  values (found_puzzle.id, auth.uid())
  on conflict do nothing;

  return found_puzzle;
end;
$$;

revoke all on function public.join_puzzle(text) from public;
grant execute on function public.join_puzzle(text) to authenticated;

-- Puzzle sahibi de katılımcı listesinde olsun
create or replace function public.handle_new_puzzle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.puzzle_players (puzzle_id, user_id)
  values (new.id, new.owner)
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_puzzle_created on public.puzzles;
create trigger on_puzzle_created
  after insert on public.puzzles
  for each row execute function public.handle_new_puzzle();

-- ---------------------------------------------------------------- arkadaşlar
-- Tek yönlü kayıt tutulur: isteği gönderen (requester) ve alan (addressee).
-- Kabul edilince status 'accepted' olur; iki taraf da arkadaş sayılır.

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester uuid not null references auth.users on delete cascade,
  addressee uuid not null references auth.users on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  unique (requester, addressee),
  check (requester <> addressee)
);

alter table public.friendships enable row level security;

create index if not exists friendships_requester_idx on public.friendships (requester);
create index if not exists friendships_addressee_idx on public.friendships (addressee);

-- Yalnızca tarafları görebilir
drop policy if exists friendships_select on public.friendships;
create policy friendships_select on public.friendships
  for select to authenticated
  using (requester = auth.uid() or addressee = auth.uid());

-- İsteği yalnızca kendi adına gönderebilirsin
drop policy if exists friendships_insert on public.friendships;
create policy friendships_insert on public.friendships
  for insert to authenticated with check (requester = auth.uid());

-- Kabul etmeyi yalnızca isteği alan yapabilir
drop policy if exists friendships_update on public.friendships;
create policy friendships_update on public.friendships
  for update to authenticated
  using (addressee = auth.uid())
  with check (addressee = auth.uid());

-- İki taraf da silebilir (isteği geri çekme / arkadaşlıktan çıkarma)
drop policy if exists friendships_delete on public.friendships;
create policy friendships_delete on public.friendships
  for delete to authenticated
  using (requester = auth.uid() or addressee = auth.uid());

-- ---------------------------------------------------------------- depolama
-- Fotoğraflar için özel (public olmayan) kova; erişim imzalı URL ile verilir.

insert into storage.buckets (id, name, public)
values ('puzzle-images', 'puzzle-images', false)
on conflict (id) do nothing;

drop policy if exists puzzle_images_insert on storage.objects;
create policy puzzle_images_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'puzzle-images' and owner = auth.uid());

drop policy if exists puzzle_images_select on storage.objects;
create policy puzzle_images_select on storage.objects
  for select to authenticated
  using (bucket_id = 'puzzle-images');

drop policy if exists puzzle_images_delete on storage.objects;
create policy puzzle_images_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'puzzle-images' and owner = auth.uid());
