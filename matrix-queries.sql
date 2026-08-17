-- ============================================================
--  矩阵视图 (/tv/<boardId>?view=matrix) 背后的查询
--
--  同一份数据的三个轴:
--    行   = label       (成果。名为 'Blocked' 的是旗标,不占一行)
--    列   = card 的指派成员
--    状态 = card 所在的 list (index 最大的那个 = Done)
--
--  用法:
--    psql "$POSTGRES_URL" -v board=<boardPublicId> -f matrix-queries.sql
--  或直接改下面这一行。
-- ============================================================

\if :{?board}
\else
  \set board 'ovj15phhvuwu'
\endif


-- ------------------------------------------------------------
-- 1) 看板结构:列(状态) / 标签(成果+旗标) / 成员
-- ------------------------------------------------------------
\echo '===== 1. lists (状态。index 最大的那个 = Done) ====='
select l.index, l.name, count(c.id) as cards
  from list l
  join board b on b.id = l."boardId"
  left join card c on c."listId" = l.id and c."deletedAt" is null
 where b."publicId" = :'board' and l."deletedAt" is null
 group by l.index, l.name
 order by l.index;

\echo '===== 2. labels (成果 = 矩阵的行；Blocked 是旗标不是行) ====='
select lb.id, lb.name, lb."colourCode",
       count(cl."cardId") as cards
  from label lb
  join board b on b.id = lb."boardId"
  left join _card_labels cl on cl."labelId" = lb.id
 where b."publicId" = :'board' and lb."deletedAt" is null
 group by lb.id, lb.name, lb."colourCode"
 order by lb.id;


-- ------------------------------------------------------------
-- 2) 矩阵本体:行 = 成果标签，列 = 指派成员
--    格子 = 同时满足「有该标签」+「指派给该人」的卡片
-- ------------------------------------------------------------
\echo '===== 3. 矩阵 (行 x 列) ====='
select lb.name as "成果 (行)",
       coalesce(string_agg(c.title || ' [' || l.name || ']', E'\n')
                filter (where u.name = 'reuben'), '—') as "Reuben",
       coalesce(string_agg(c.title || ' [' || l.name || ']', E'\n')
                filter (where u.name = 'zach'),   '—') as "Zach",
       coalesce(string_agg(c.title || ' [' || l.name || ']', E'\n')
                filter (where u.name = 'Kim'),    '—') as "Kim"
  from label lb
  join board b on b.id = lb."boardId"
  -- 行:卡片 ↔ 成果标签
  left join _card_labels cl on cl."labelId" = lb.id
  left join card c on c.id = cl."cardId" and c."deletedAt" is null
  left join list l on l.id = c."listId"
  -- 列:卡片 ↔ 指派成员
  left join _card_workspace_members cm on cm."cardId" = c.id
  left join workspace_members wm on wm.id = cm."workspaceMemberId"
  left join "user" u on u.id = wm."userId"
 where b."publicId" = :'board'
   and lb."deletedAt" is null
   and lb.name <> 'Blocked'          -- Blocked 是旗标,不占一行
 group by lb.name, lb.id
 order by lb.id;


-- ------------------------------------------------------------
-- 3) 每个成果的完成百分比
--    "完成" = 卡片位于 index 最大的 list
-- ------------------------------------------------------------
\echo '===== 4. 百分比 ====='
with done_list as (
  select l.id
    from list l
    join board b on b.id = l."boardId"
   where b."publicId" = :'board' and l."deletedAt" is null
   order by l.index desc
   limit 1
)
select lb.name                                                            as "成果",
       lb."colourCode"                                                    as "颜色",
       count(c.id) filter (where c."listId" = (select id from done_list))  as "已完成",
       count(c.id)                                                        as "总数",
       round(100.0 * count(c.id) filter (where c."listId" = (select id from done_list))
             / nullif(count(c.id), 0)) || '%'                             as "百分比"
  from label lb
  join board b on b.id = lb."boardId"
  left join _card_labels cl on cl."labelId" = lb.id
  left join card c on c.id = cl."cardId" and c."deletedAt" is null
 where b."publicId" = :'board'
   and lb."deletedAt" is null
   and lb.name <> 'Blocked'
 group by lb.name, lb."colourCode", lb.id
 order by lb.id;


-- ------------------------------------------------------------
-- 4) 明细:每张卡的完整三个属性
-- ------------------------------------------------------------
\echo '===== 5. 卡片明细 (状态 / 成果 / 负责人 / 是否阻塞) ====='
select c."cardNumber"                                   as "#",
       c.title                                          as "任务",
       l.name                                           as "状态",
       (select lb2.name from _card_labels cl2
          join label lb2 on lb2.id = cl2."labelId"
         where cl2."cardId" = c.id and lb2.name <> 'Blocked'
         limit 1)                                       as "成果",
       coalesce(u.name, '(未指派)')                      as "负责人",
       exists (select 1 from _card_labels cl3
                 join label lb3 on lb3.id = cl3."labelId"
                where cl3."cardId" = c.id and lb3.name = 'Blocked')
                                                        as "阻塞"
  from card c
  join list l  on l.id = c."listId"
  join board b on b.id = l."boardId"
  left join _card_workspace_members cm on cm."cardId" = c.id
  left join workspace_members wm on wm.id = cm."workspaceMemberId"
  left join "user" u on u.id = wm."userId"
 where b."publicId" = :'board' and c."deletedAt" is null
 order by l.index, c.index;


-- ------------------------------------------------------------
-- 5) 单个格子:一行 SQL 说明矩阵原理
--    两个 join 各负责一个轴 —— 这就是矩阵
-- ------------------------------------------------------------
\echo '===== 6. 单格示例: Sort out investors x reuben ====='
select c.title, l.name as "状态"
  from card c
  join list l on l.id = c."listId"
  join _card_labels cl on cl."cardId" = c.id                   -- 轴1: 行
  join label lb on lb.id = cl."labelId"
  join _card_workspace_members cm on cm."cardId" = c.id        -- 轴2: 列
  join workspace_members wm on wm.id = cm."workspaceMemberId"
  join "user" u on u.id = wm."userId"
 where lb.name = 'Sort out investors'
   and u.name  = 'reuben'
   and c."deletedAt" is null;
