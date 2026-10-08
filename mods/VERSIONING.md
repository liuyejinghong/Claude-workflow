# Mods 版本规则

每个 mod 独立使用 SemVer（`MAJOR.MINOR.PATCH`）：不兼容变更增加 MAJOR，兼容的新功能增加 MINOR，兼容修复增加 PATCH。版本不与仓库中的 agents、skill 或其它 mod 绑定。

Git tag 格式为 `<mod>-v<version>`，例如 token-speed 0.2.1 使用 `token-speed-v0.2.1`。token-speed 的 0.1.0 和 0.2.0 是本地开发历史，未发布 GitHub tag；0.2.1 是首次 GitHub 发布。

每次更新须同步以下版本，并更新该 mod 的 `CHANGELOG.md`，记录用户可见变化及必要的迁移说明：

- mod 的 `.claude-plugin/plugin.json` 中的 `version`。
- 根 `.claude-plugin/marketplace.json` 中对应插件的 `version`。
- mod README 标题中的版本。
- mod 命令输出中的版本文本；token-speed 对应 `/tok-speed` 的 command text。

发布前先校验 manifest，运行测试和 typecheck。以 token-speed 为例，从仓库根目录执行：

```sh
claude plugin validate .claude-plugin/marketplace.json --strict
claude plugin validate mods/token-speed --strict
claude plugin test mods/token-speed
tsc -p mods/token-speed
```

Typecheck 前须先通过 CLI 加载生成 `.claude-plugin/types`，或使用同一 CLI 提供的 API 类型声明进行检查。function-hooks 是早期接口，类型声明应与所验证的 CLI 版本一致；token-speed 0.2.1 已验证 CLI 2.1.294。生成类型是开发产物，不提交到仓库，`/mods/*/.claude-plugin/types/` 已加入根 `.gitignore`。测试使用合成 stream，不需要运行模型请求。

校验、测试和 typecheck 通过后再创建对应版本的 tag。已发布 tag 不改写；需要修复时发布新版本并创建新 tag。当前规则只约定手动发布流程，不包含自动发布脚本。
