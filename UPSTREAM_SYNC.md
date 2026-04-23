# Upstream Sync Guide

本仓库以 `upstream/master` 为功能基线，仅保留 LmaoAPI 品牌层改动。

## 远端约定

- `origin`: 你的仓库 `n8n-nodes-lmaoapi`
- `upstream`: 原项目仓库 `n8n-nodes-maibaoapi`

## 日常同步步骤

快捷方式：

```bash
npm run sync-upstream
```

如果你确认本次同步完成后要立即推送到 `origin/main`，可使用：

```bash
npm run sync-upstream -- --push
```

脚本默认会检查工作区是否干净，并自动执行 `fetch -> switch main -> rebase -> lint -> build`。默认不会自动推送，避免误覆盖远端历史。

1. 确保工作区干净：

```bash
git status
```

如果有未提交改动，先提交或暂存，不要直接 rebase。

2. 切到主开发分支：

```bash
git switch main
```

3. 拉取上游最新提交和标签：

```bash
git fetch upstream --tags
```

预期结果：更新本地 `upstream/master`，但不会直接改当前代码。

4. 把本地品牌层改动重放到上游最新代码之上：

```bash
git rebase upstream/master
```

预期结果：

- 无冲突时：`main` 直接变成“最新上游 + 现有品牌层”
- 有冲突时：手动解决后执行 `git add <files>` 和 `git rebase --continue`
- 想放弃本次重放：`git rebase --abort`

5. 验证：

```bash
npm run lint
npm run build
```

6. 推送到你的远端：

```bash
git push
```

如果这次 rebase 改写了提交历史，普通推送被拒绝时，改用：

```bash
git push --force-with-lease
```

## 常见冲突文件

同步上游时，优先检查这些品牌层文件：

- `package.json`
- `package-lock.json`
- `README.md`
- `credentials/MaibaoApi.credentials.ts`
- `nodes/MaibaoApi/MaibaoApi.node.ts`
- `credentials/maibaoapi.svg`
- `nodes/MaibaoApi/maibaoapi.svg`

## 品牌层约束

为了降低后续同步成本，尽量只修改以下内容：

- 用户可见名称
- logo / icon
- 默认 `Base URL`
- 凭证中的 `Base URL` 可配置行为
- 包元数据和 README

尽量不要修改内部文件名、目录名、类名或核心功能逻辑，除非确实是功能修复。
