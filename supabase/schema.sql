-- Birlikte Puzzle — Supabase şeması
-- Kurulum: Supabase panelinde SQL Editor'ü açıp bu dosyanın tamamını çalıştırın.

-- ---------------------------------------------------------------- profiller

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null default '',
  -- avatars kovasındaki dosyanın yolu (<uid>/avatar.jpg)
  avatar_path text,
  -- yaş yerine doğum yılı tutuluyor: her yıl güncellenmesi gerekmesin
  birth_year int check (birth_year between 1900 and 2100),
  gender text check (gender in ('kadin', 'erkek', 'diger', 'gizli')),
  created_at timestamptz not null default now()
);

-- Şema daha önce çalıştırıldıysa eksik sütunları tamamla
alter table public.profiles add column if not exists avatar_path text;
alter table public.profiles add column if not exists birth_year int;
alter table public.profiles add column if not exists gender text;

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
  -- hazır eser seçildiyse ressamı (bitiş ekranında gösterilir)
  artist text not null default '',
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
alter table public.puzzles add column if not exists artist text not null default '';
-- Özel gün puzzle'ı: bu zamana kadar kilitli kalır
alter table public.puzzles add column if not exists unlock_at timestamptz;

alter table public.puzzles enable row level security;

-- Ortak tablo: bir puzzle'a katılan herkes onu geçmişinde görür
create table if not exists public.puzzle_players (
  puzzle_id uuid not null references public.puzzles on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  -- owner: odayı kuran (yetkisi elinden alınamaz)
  -- mod:   sahibin çıkarma yetkisi verdiği kişi
  -- player: sıradan katılımcı
  role text not null default 'player' check (role in ('owner', 'mod', 'player')),
  -- odadan çıkarılanın kaydı silinmiyor: silinseydi aynı linkle geri girerdi
  banned boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (puzzle_id, user_id)
);

alter table public.puzzle_players add column if not exists role text not null default 'player';
alter table public.puzzle_players add column if not exists banned boolean not null default false;

alter table public.puzzle_players enable row level security;

create index if not exists puzzle_players_user_idx on public.puzzle_players (user_id);
create index if not exists puzzles_room_code_idx on public.puzzles (room_code);

-- ---------------------------------------------------------------- politikalar
-- Not: puzzles ve puzzle_players politikaları birbirine baksaydı RLS sonsuz
-- özyinelemeye girerdi; bu yüzden üyelik kontrolü security definer fonksiyonla
-- yapılıyor (fonksiyon RLS'i atlar).

-- Odadan çıkarılmış kişi katılımcı sayılmaz: puzzle'ı göremez, güncelleyemez
-- ve fotoğrafına erişemez.
create or replace function public.is_puzzle_player(p_puzzle uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.puzzle_players
    where puzzle_id = p_puzzle and user_id = auth.uid() and not banned
  );
$$;

-- Profil görünürlüğü: kendini, birlikte puzzle çözdüklerini ve arkadaşlık
-- ilişkisi olduğun kişileri görürsün. Eskiden "herkes herkesi görebilir"
-- idi; bu, kayıtlı herkesin tüm kullanıcıları listeleyebilmesi demekti.
create or replace function public.profil_gorulebilir(p_kisi uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    p_kisi = auth.uid()
    or exists (
      select 1
      from public.puzzle_players benim
      join public.puzzle_players digeri on digeri.puzzle_id = benim.puzzle_id
      where benim.user_id = auth.uid() and digeri.user_id = p_kisi
    )
    or exists (
      select 1 from public.friendships
      where (requester = auth.uid() and addressee = p_kisi)
         or (addressee = auth.uid() and requester = p_kisi)
    );
$$;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (public.profil_gorulebilir(id));

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

  -- Özel gün kilidi: sahibi dışında kimse tarihten önce giremez.
  -- Bu kontrol sunucuda olmalı; yalnızca arayüzde olduğunda oda kodunu
  -- bilen biri gizli notu ve fotoğrafı tarihten önce okuyabiliyordu.
  if found_puzzle.unlock_at is not null
     and found_puzzle.unlock_at > now()
     and found_puzzle.owner <> auth.uid() then
    raise exception 'puzzle henuz acilmadi';
  end if;

  -- Odadan çıkarılan kişi aynı linkle geri giremesin
  if exists (
    select 1 from public.puzzle_players
    where puzzle_id = found_puzzle.id and user_id = auth.uid() and banned
  ) then
    raise exception 'odadan cikarildin';
  end if;

  insert into public.puzzle_players (puzzle_id, user_id, role)
  values (found_puzzle.id, auth.uid(),
          case when found_puzzle.owner = auth.uid() then 'owner' else 'player' end)
  on conflict do nothing;

  return found_puzzle;
end;
$$;

-- Katılımcılar oyunu birlikte oynayabilsin ama puzzle'ın kimliğini
-- değiştiremesin: sahiplik, fotoğraf, oda kodu ve kilit tarihi korunur.
create or replace function public.puzzle_guncelleme_kontrol()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner is distinct from old.owner then
    raise exception 'sahiplik degistirilemez';
  end if;
  if auth.uid() is distinct from old.owner then
    if new.image_path is distinct from old.image_path
       or new.room_code is distinct from old.room_code
       or new.unlock_at is distinct from old.unlock_at
       or new.seed is distinct from old.seed
       or new.piece_count is distinct from old.piece_count
       or new.rotation is distinct from old.rotation
       or new.max_players is distinct from old.max_players then
      raise exception 'bu alani yalnizca puzzle sahibi degistirebilir';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists on_puzzle_update on public.puzzles;
create trigger on_puzzle_update
  before update on public.puzzles
  for each row execute function public.puzzle_guncelleme_kontrol();

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
  insert into public.puzzle_players (puzzle_id, user_id, role)
  values (new.id, new.owner, 'owner')
  on conflict (puzzle_id, user_id) do update set role = 'owner';
  return new;
end;
$$;

drop trigger if exists on_puzzle_created on public.puzzles;
create trigger on_puzzle_created
  after insert on public.puzzles
  for each row execute function public.handle_new_puzzle();

-- --------------------------------------------------- oda yetkileri
-- Kurucu (owner) herkesi çıkarabilir ve istediğine çıkarma yetkisi (mod)
-- verip alabilir. Mod yalnızca sıradan katılımcıyı çıkarabilir: ne kurucuya
-- ne başka bir moda dokunabilir, yetki de dağıtamaz.

create or replace function public.oda_rolu(p_puzzle uuid, p_user uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from public.puzzle_players
  where puzzle_id = p_puzzle and user_id = p_user and not banned;
$$;

-- Odadaki kişiler: ad, rol ve avatar. Yalnızca odanın katılımcıları çağırabilir.
create or replace function public.oda_katilimcilari(p_puzzle uuid)
returns table (user_id uuid, ad text, rol text, avatar_path text)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if public.oda_rolu(p_puzzle, auth.uid()) is null then
    raise exception 'bu odanin katilimcisi degilsin';
  end if;
  return query
    select pp.user_id,
           coalesce(nullif(pr.display_name, ''), 'İsimsiz'),
           pp.role,
           pr.avatar_path
    from public.puzzle_players pp
    left join public.profiles pr on pr.id = pp.user_id
    where pp.puzzle_id = p_puzzle and not pp.banned
    order by (pp.role = 'owner') desc, pp.joined_at;
end;
$$;

create or replace function public.oyuncu_cikar(p_puzzle uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  benim_rol text := public.oda_rolu(p_puzzle, auth.uid());
  hedef_rol text := public.oda_rolu(p_puzzle, p_user);
begin
  if benim_rol not in ('owner', 'mod') or benim_rol is null then
    raise exception 'yetkin yok';
  end if;
  if hedef_rol is null then
    raise exception 'kisi odada degil';
  end if;
  if p_user = auth.uid() then
    raise exception 'kendini cikaramazsin';
  end if;
  -- Kurucuya dokunulamaz; mod da başka bir modu çıkaramaz
  if hedef_rol = 'owner' then
    raise exception 'odayi kuran kisi cikarilamaz';
  end if;
  if benim_rol = 'mod' and hedef_rol = 'mod' then
    raise exception 'yetkili bir kisiyi yalnizca odayi kuran cikarabilir';
  end if;

  update public.puzzle_players
  set banned = true, role = 'player'
  where puzzle_id = p_puzzle and user_id = p_user;
end;
$$;

create or replace function public.yetki_ayarla(p_puzzle uuid, p_user uuid, p_yetkili boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  benim_rol text := public.oda_rolu(p_puzzle, auth.uid());
  hedef_rol text := public.oda_rolu(p_puzzle, p_user);
begin
  -- Yetki dağıtmak yalnızca kurucunun elinde; mod kendi yetkisini
  -- başkasına aktaramaz, kurucunun rolünü de değiştiremez.
  if benim_rol is distinct from 'owner' then
    raise exception 'yetkiyi yalnizca odayi kuran verebilir';
  end if;
  if hedef_rol is null then
    raise exception 'kisi odada degil';
  end if;
  if hedef_rol = 'owner' then
    raise exception 'odayi kuranin yetkisi degistirilemez';
  end if;

  update public.puzzle_players
  set role = case when p_yetkili then 'mod' else 'player' end
  where puzzle_id = p_puzzle and user_id = p_user;
end;
$$;

revoke all on function public.oda_katilimcilari(uuid) from public;
revoke all on function public.oyuncu_cikar(uuid, uuid) from public;
revoke all on function public.yetki_ayarla(uuid, uuid, boolean) from public;
grant execute on function public.oda_katilimcilari(uuid) to authenticated;
grant execute on function public.oyuncu_cikar(uuid, uuid) to authenticated;
grant execute on function public.yetki_ayarla(uuid, uuid, boolean) to authenticated;

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

-- unique(requester, addressee) yalnızca tek yönü koruyordu: A→B kabul
-- edildikten sonra B→A ikinci bir kayıt açabiliyor, aynı kişi listede iki kez
-- görünüyordu. Önce birikmiş çiftleri temizle, sonra yöne bakmayan bir
-- benzersizlik kur.
delete from public.friendships f
using public.friendships g
where least(f.requester, f.addressee) = least(g.requester, g.addressee)
  and greatest(f.requester, f.addressee) = greatest(g.requester, g.addressee)
  and f.id <> g.id
  and (
    (f.status = 'pending' and g.status = 'accepted')
    or (f.status = g.status and (f.created_at, f.id) > (g.created_at, g.id))
  );

create unique index if not exists friendships_cift_idx
  on public.friendships (least(requester, addressee), greatest(requester, addressee));

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

-- ------------------------------------------------------------ özel mesajlar
-- Yalnızca arkadaş olan kişiler birbirine yazabilir.

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender uuid not null references auth.users on delete cascade,
  receiver uuid not null references auth.users on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check (sender <> receiver)
);

alter table public.messages enable row level security;

create index if not exists messages_ikili_idx
  on public.messages (sender, receiver, created_at desc);
create index if not exists messages_receiver_idx on public.messages (receiver, read_at);

-- İki kullanıcı arkadaş mı (RLS özyinelemesini önlemek için security definer)
create or replace function public.arkadas_mi(p_kisi uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.friendships
    where status = 'accepted'
      and ((requester = auth.uid() and addressee = p_kisi)
        or (addressee = auth.uid() and requester = p_kisi))
  );
$$;

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select to authenticated
  using (sender = auth.uid() or receiver = auth.uid());

-- Göndermek için arkadaş olmak şart
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert to authenticated
  with check (sender = auth.uid() and public.arkadas_mi(receiver));

-- Alıcı okundu işaretleyebilir
drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages
  for update to authenticated
  using (receiver = auth.uid())
  with check (receiver = auth.uid());

drop policy if exists messages_delete on public.messages;
create policy messages_delete on public.messages
  for delete to authenticated
  using (sender = auth.uid());

-- ---------------------------------------------------------------- depolama
-- Fotoğraflar için özel (public olmayan) kova; erişim imzalı URL ile verilir.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('puzzle-images', 'puzzle-images', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = 10485760,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

/*
  Fotoğraf görünürlüğü. Önceki politika "kayıtlı olan herkes tüm kovayı
  okuyabilir" diyordu; yani başka birinin özel fotoğrafı, yolu bilindiğinde
  (ya da imzalı URL üretilerek) indirilebiliyordu.

  Artık yalnızca o puzzle'ın katılımcıları görebilir ve kilitli bir puzzle'ın
  fotoğrafına tarih gelene kadar sahibi dışında kimse erişemez.
*/
create or replace function public.foto_gorulebilir(p_yol text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.puzzles p
    where p.image_path = p_yol
      and (
        p.owner = auth.uid()
        or (
          public.is_puzzle_player(p.id)
          and (p.unlock_at is null or p.unlock_at <= now())
        )
      )
  );
$$;

drop policy if exists puzzle_images_insert on storage.objects;
create policy puzzle_images_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'puzzle-images'
    and owner = auth.uid()
    -- kendi klasörünün dışına yazamasın
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists puzzle_images_select on storage.objects;
create policy puzzle_images_select on storage.objects
  for select to authenticated
  using (bucket_id = 'puzzle-images' and public.foto_gorulebilir(name));

-- Kendi dosyasının üzerine yazabilmeli (upsert bunu UPDATE olarak yapar;
-- bu politika olmadan aynı yola ikinci kez yükleme RLS'e takılıyordu)
drop policy if exists puzzle_images_update on storage.objects;
create policy puzzle_images_update on storage.objects
  for update to authenticated
  using (bucket_id = 'puzzle-images' and owner = auth.uid())
  with check (
    bucket_id = 'puzzle-images'
    and owner = auth.uid()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists puzzle_images_delete on storage.objects;
create policy puzzle_images_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'puzzle-images' and owner = auth.uid());

-- ------------------------------------------------------------ profil fotoğrafı
-- Ayrı ve küçük bir kova. Görünürlük profil kuralıyla aynı: fotoğrafını
-- yalnızca birlikte oynadığın ya da arkadaş olduğun kişiler görebilir.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = 2097152,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists avatars_insert on storage.objects;
create policy avatars_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and owner = auth.uid()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatars_update on storage.objects;
create policy avatars_update on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and owner = auth.uid())
  with check (
    bucket_id = 'avatars'
    and owner = auth.uid()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Klasör adı geçerli bir kimlik değilse uuid'e çevirme hatası vermesin diye
-- kontrol ayrı bir fonksiyonda.
create or replace function public.avatar_gorulebilir(p_yol text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select case
    when (storage.foldername(p_yol))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      then public.profil_gorulebilir(((storage.foldername(p_yol))[1])::uuid)
    else false
  end;
$$;

drop policy if exists avatars_select on storage.objects;
create policy avatars_select on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and public.avatar_gorulebilir(name));

drop policy if exists avatars_delete on storage.objects;
create policy avatars_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and owner = auth.uid());
