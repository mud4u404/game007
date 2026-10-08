# 云端试玩

用户要求后续试玩通过网址直接打开。固定入口：

https://mud4u404.github.io/game007/demo.html?layout=focus

首次开通前该地址不可用；以 GitHub Actions 的「发布云端试玩」成功部署以及实际访问结果为准。

## 首次开通

在 [game007 的 Pages 设置](https://github.com/mud4u404/game007/settings/pages) 中，将 **Build and deployment → Source** 设为 **GitHub Actions**。本仓库已经提供工作流，无需再选择模板或新建工作流，也不需要填写任何密钥。

当前代理连接具备代码推送权限，但创建 Pages 站点的 API 返回 `403 Resource not accessible by integration`。因此首次开通需由仓库所有者在网页设置中完成。

如果部署提示发布分支不被允许，进入 [github-pages 环境设置](https://github.com/mud4u404/game007/settings/environments)，在 Deployment branches and tags 中允许 `codex/jianghu-sandbox-demo`。不要改成需要人工逐次批准的环境，否则无法自动交付。

设置完成后重新运行失败的「发布云端试玩」，或执行：

```bash
gh workflow run pages.yml --repo mud4u404/game007 --ref codex/jianghu-sandbox-demo
```

## 后续发布

- 继续在 `codex/jianghu-sandbox-demo` 开发并提交、推送。
- `.github/workflows/pages.yml` 对推送运行安装、类型检查、245 项现有测试（随代码演进会变化）、构建和手机浏览器验收；全部成功后发布 `dist`。
- Pages 直接部署这一分支，无需先合并 `main`。不依赖仓库变量 `ENABLE_PAGES`，也不发布其他仓库。
- 推送成功不等于网站发布成功。等部署结束，访问试玩页面，并核对 `https://mud4u404.github.io/game007/version.json` 的 `commit` 等于本轮提交。
- 用手机尺寸验证选出身、点人交涉、行路以及页面资源正常加载后，向用户交付网址。可附 `&v=<短提交号>` 帮助区分分享的版本，但同一网址始终服务最近成功发布的代码。
- 如果改用其他发布分支，必须同时修改工作流触发器、build 的 ref 条件和 Pages 环境允许的分支。

云端托管只负责发送网页，游戏进度仍存当前浏览器；没有启用云存档。离线 HTML 导出保留作开发工具，不再作为默认试玩交付。
