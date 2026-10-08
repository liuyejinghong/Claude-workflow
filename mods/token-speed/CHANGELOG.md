# token-speed Changelog

## 0.2.1

首次 GitHub 发布，对应 tag `token-speed-v0.2.1`。

- 使用跟随 CLI 主题的配色：区分身份与模型、Live、Avg、Last、缺值和运行状态，主控身份及有效 Live 加粗。
- 将 authored 文件、测试与安装文档纳入本仓库的独立 mods 目录。

## 0.2.0

本地开发历史，未发布 GitHub tag。

- 支持主控与多个活跃 agent，各代理单独显示一行。
- 各代理按请求模型独立累计 API 速率与加权均值，同模型代理不共享统计桶。
- 稳定请求模型名称与渠道前缀，响应的 `usage.model` 不改变请求标签或统计桶。
- 迁移 0.1 的主控统计，保留独立标记的 legacy response-model 桶，不混入新请求模型均值。

## 0.1.0

本地开发历史，未发布 GitHub tag。

- 首个主控版：显示实时估算速率与 API 输出速率统计，提供 `/tok-speed` 查询和 reset。
