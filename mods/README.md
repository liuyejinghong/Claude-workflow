# Claude Code mods

这里收录可独立安装的 Claude Code function-hooks mods，不依赖 Magpie 或模型上游订阅，也不由根目录 `install.sh` 安装。

| Mod | 版本 | 功能与安装 |
|---|---|---|
| token-speed | 0.3.2 | 主控与每个活跃子代理各一行，显示模型、effort、上下文占用与输出速率（Live / Last / Avg），工作区行在最后；离线模型窗口表见 [model-contexts.json](token-speed/data/model-contexts.json)。详见 [token-speed README](token-speed/README.md) |

安装前请查看各 mod 的 CLI 兼容版本、安装前提与限制。Marketplace 名称为 `claude-workflow-mods`，已合并到 `main`，可直接安装：

```text
/plugin marketplace add liuyejinghong/Claude-workflow
/plugin install token-speed@claude-workflow-mods
```

也可用固定 tag `token-speed-v0.3.2` 获取源文件，并按 [token-speed README](token-speed/README.md) 中的 `--plugin-dir` 方式从 checkout 加载。

每个 mod 独立维护版本；版本与 tag 规则见 [VERSIONING.md](VERSIONING.md)，token-speed 的历史见 [CHANGELOG.md](token-speed/CHANGELOG.md)。
