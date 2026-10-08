# 项目规则（Trae 会自动读取本文件）

本文件属于 game007。以 `AGENTS.md` 的「game007 独立创作约定」为先；旧任务与角色分工仅供参考，不执行来源仓库的任务。

开始任何任务前，先完整阅读仓库根目录的 `AGENTS.md` 和 `docs/content-guide.md`。根本原则见 `docs/charter.md`，不能违反。

负责人说「进入自动模式」时，按 `AGENTS.md` 第十节循环：运行 `node scripts/wait-for-work.mjs` 等任务，它退出后做它打印的那个任务，做完再回去等。

要点：

1. 每个 GitHub Issue 单独一个分支、一个 PR。可以连续做好几个，做完一个再开下一个。动手前先读 Issue 下的评论。
   - 先 `git fetch origin`，再 `git switch -c trae/<Issue 编号>-<简短英文> origin/main`。
   - 不要在上一个任务的分支上接着做。
2. 内容任务只在 `src/content/packs/` 下新建自己的文件。人物放进已有地点用 `at`，新地点连通已有地点用出口第三项「回程方位」。
3. 不要修改以下位置，除非 Issue 明确允许：
   - `src/engine/`、`src/ui/`、`src/styles/`、`src/core/`
   - `src/content/types.ts`、`src/content/index.ts`、`src/content/skills.ts`
   - `tests/`（可以往 `tests/forbidden-names.ts` 里加名字）
4. 不新增依赖。不删除、不改名已有 id。
5. 金庸的武功、门派、典故都可以用；但书中人物不作为 NPC 出场（见 `tests/forbidden-names.ts`）。对白用「」，嵌套用『』，不用英文引号。
6. 提交前运行 `npm run check` 和 `npm run build`，必须全部通过。
   - 再用 `git diff --stat origin/main` 确认只改了允许的文件。
   - 不提交 `CODE_WIKI.md` 和 `.trae-html-share-packages/`。
7. 不用自己建 PR：提交说明第一行写 `[#编号] 任务标题`，正文写新增的 id、怎样触发、文字演示和自检的真实输出，然后 `git push -u origin <分支名>`。CI 会自动建 PR，正文取自提交说明。
   - 分支名必须是 `<工具名>/<Issue 编号>-<简短英文>`，CI 靠里面的编号建 PR。
   - CI 变绿以后不要再往这个分支推送。推送被拒时不要强推，先看远端是不是已经有你的内容。
   - 只新增内容包的 PR，CI 全部通过就自动合并。维护者每天集中审一次，有问题直接修订。功能 PR 由负责人合并。
   - 功能任务：只改 Issue 允许的文件；Issue 给的测试用例原样放进去，并让它通过；不改其他测试，不改 `tests/style-rules.ts`。
8. 发现数据格式表达不了需求时，在 Issue 里说明，等维护者处理，不要自己改引擎绕过去。
