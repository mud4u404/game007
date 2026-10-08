# 云存档后台：Supabase 设置（历史参考）

game007 开发测试版已停用云存档，移除账号入口、自动同步启动以及云端体检工作流。当前不需要配置 Supabase 或任何密钥。下文仅保留为原实现的资料，不是 game007 的设置步骤；将来若明确恢复此功能，必须使用独立后台。

账号和云存档用 Supabase 的免费版。玩家用「用户名 + 密码」注册，不用邮箱。游戏照常先存在本机，登录后再同步到云上。

## 一、负责人一次性设置（约十分钟）

1. **建项目**
   - 打开 https://supabase.com/dashboard ，点 **New project**。
   - Name 填新项目的独立名称。
   - Database Password 点 Generate 生成一个，存到你自己的密码本里。维护者用不到它，**不要发给任何人**。
   - Region 选 **Northeast Asia (Tokyo)**，国内访问最快。
   - 方案选 **Free**，点 **Create new project**，等一两分钟。
2. **关掉邮箱验证**：用户名注册不发邮件。
   - 左侧点 **Authentication**，再点 **Sign In / Providers**。
   - 打开 **Email** 一项，把 **Confirm email** 关掉，点 **Save**。
   - 同一页确认 **Allow new users to sign up** 是开着的。
3. **建表**
   - 左侧点 **SQL Editor**，再点 **New query**。
   - 把下面第二节的 SQL 整段粘贴进去，点右下角 **Run**，看到 `Success` 就好。
4. **把两样东西发给维护者**
   - 点顶部的 **Connect**；或者进 **Project Settings → Data API**（旧版界面叫 API）。
   - 复制 **Project URL**，形如 `https://abcdefgh.supabase.co`。
   - 再进 **Project Settings → API Keys**，复制 **anon public**，或者 **Publishable key**（以 `sb_publishable_` 开头）。

   这两样本来就是公开给网页用的，可以放进仓库。
   **千万不要发** `service_role`、`Secret key`、数据库密码。

## 二、建表 SQL

```sql
-- 江湖夜雨：云存档。只需运行一次；重复运行也没关系。

-- 每个账号一份当前存档
create table if not exists public.saves (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  version int not null,
  summary text not null default '',
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.saves enable row level security;
drop policy if exists "saves_select_own" on public.saves;
drop policy if exists "saves_insert_own" on public.saves;
drop policy if exists "saves_update_own" on public.saves;
create policy "saves_select_own" on public.saves for select using (auth.uid() = user_id);
create policy "saves_insert_own" on public.saves for insert with check (auth.uid() = user_id);
create policy "saves_update_own" on public.saves for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update on public.saves to authenticated;

-- 云上的历史备份：每个账号保留最近 30 份，误操作时可以找回
create table if not exists public.save_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  version int not null,
  summary text not null default '',
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists save_history_user on public.save_history (user_id, created_at desc);
alter table public.save_history enable row level security;
drop policy if exists "history_select_own" on public.save_history;
drop policy if exists "history_insert_own" on public.save_history;
create policy "history_select_own" on public.save_history for select using (auth.uid() = user_id);
create policy "history_insert_own" on public.save_history for insert with check (auth.uid() = user_id);
grant select, insert on public.save_history to authenticated;

create or replace function public.keep_recent_history() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.save_history
  where user_id = new.user_id
    and id not in (
      select id from public.save_history
      where user_id = new.user_id
      order by created_at desc
      limit 30
    );
  return new;
end $$;
drop trigger if exists keep_recent_history on public.save_history;
create trigger keep_recent_history after insert on public.save_history
  for each row execute function public.keep_recent_history();
```

## 三、怎么运作（写给维护者）

- **本机优先**：游戏照常存在浏览器里。离线也能玩，云上只是多一份。
- **登录**：用户名在客户端换算成一个内部邮箱地址再交给 Supabase；邮箱验证已关，不发邮件。
  - 忘了密码时，由负责人在 **Authentication → Users** 里找到这个人，帮他重设。
- **同步**：
  - 存档后约三十秒推一次云；
  - 每天第一次推送时，顺手往 `save_history` 记一份。
  - 登录时，如果本机和云上的进度不一样，让玩家自己选留哪一份；另一份照样留作备份，不会丢。
- **历史防休眠机制**：免费项目一周没人访问会暂停；game007 已移除原先的定时访问工作流。
- **配置**：Project URL 和公开密钥写在 `src/net/config.ts`。没有填时，账号功能自动隐藏，游戏照常单机运行。
