# Upstream Sync Guide

本仓库以 `https://github.com/kkuxb/n8n-nodes-maibaoapi.git` 的 `master` 分支为功能基线，只维护 LmaoAPI 品牌层和同步工具本身。

## 同步契约

同步脚本以一份全新的上游快照为基础，而不是把本地历史 rebase 到上游：

1. 在系统临时目录浅克隆最新 `upstream/master`。
2. 完整保留上游源码、测试、依赖锁文件、README 和 CHANGELOG 内容。
3. 按 `scripts/upstream-brand.json` 应用 LmaoAPI 名称、包名、SVG logo、凭证名、仓库链接和 API 地址。
4. 在隔离候选目录执行 `npm ci`、lint、build 和完整测试。
5. 只有全部通过后才把受管文件复制回当前仓库；失败时当前仓库不会被同步到一半。
6. `.upstream-sync-state.json` 记录本次上游提交和受管路径，后续会同步删除上游已经移除的文件。

不需要预先配置本地 `upstream` Git remote。上游地址和分支由 `scripts/upstream-brand.json` 管理，也可以临时使用 `UPSTREAM_URL`、`UPSTREAM_BRANCH` 环境变量覆盖。

## 日常同步

先做只读检查：

```bash
npm run sync-upstream -- --check
```

该命令会构建并验证最新候选，但不会修改当前仓库。确认候选正常后执行：

```bash
npm run sync-upstream
```

同步完成后检查差异，再正常提交和推送：

```bash
git status
git diff
git add .
git commit -m "chore: sync with upstream vX.Y.Z"
git push
```

脚本不再自动 rebase、提交、强制推送或发布。

## 品牌层归属

`scripts/upstream-brand.json` 是品牌层的唯一声明入口，包含：

- npm 包名、主页、仓库和 Issues 地址
- n8n 节点显示名与凭证内部名称
- 默认 API Origin 和 Base URL
- Node.js/npm 运行时约束
- 本项目拥有、同步时必须原样保留的文件
- 已退役、应从上游快照中删除的旧品牌资源

当前显式保留的品牌资源包括：

- `credentials/maibaoapi.svg`
- `nodes/MaibaoApi/maibaoapi.svg`
- `scripts/dev.mjs` 中注入的 LmaoAPI 本地开发缓存清理（脚本其余内容仍取上游最新版）
- 同步脚本、配置、文档和同步回归测试

内部目录、类名和构建入口仍保留 `MaibaoApi`，避免破坏 n8n 包入口兼容性；用户可见名称和凭证标识保持为 `LmaoAPI` / `lmaoApi`。

## 文档和版本同步

以下文件每次都从上游最新版本重新生成，再应用品牌替换：

- `package.json`
- `package-lock.json`
- `README.md`
- `CHANGELOG.md`
- `CLAUDE.md`
- `PROJECT_INDEX.md`
- `PROJECT_INDEX.json`

因此上游版本号、功能说明、变更记录和完整依赖图会同步更新；LmaoAPI 名称、安装包名、仓库链接和 API 地址不会被上游品牌覆盖。

## 安全失败条件

遇到以下情况会在写入工作区前失败：

- 工作区不干净（受控修复时可显式传入 `--allow-dirty`）
- 上游无法克隆
- 上游节点或凭证结构变化，现有品牌补丁无法确定性应用
- 版本、包名、logo、凭证或 API 地址校验失败
- `npm ci`、lint、build 或任一测试失败

上游结构确实变化时，应先更新 `scripts/upstream-sync-lib.mjs` 中的品牌转换和 `test/upstream-sync.test.js` 的契约测试，再重新同步，不能跳过校验直接覆盖。
