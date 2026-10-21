# 说明

本项目提供独立的记忆与关系模块，不隶属于或代表 DeepSeek。

DSH 及其官方依赖、QQ/OneBot 接入和其他独立组件遵循各自的许可。本包通过接口调用宿主，不附带这些组件的程序或登录凭证。

`integrations/onebot-group-send-limits/` 另附针对 `dsh-onebot-qq` 的可选源码补丁，包含上游程序的少量差异上下文。其上游为 https://github.com/mario841859784/dsh-onebot ，Copyright (c) 2026, dsh-external contributors。该补丁及其中派生代码按 BSD-3-Clause 分发，完整许可保存在该目录的 `LICENSE.BSD-3-Clause`；不适用本项目其余原创文件的 MIT 许可。该目录不包含登录客户端或账户凭证。

`examples/persona.example.md` 是可选角色起点。不要用它覆盖已经成长的现有人格笔记；该模板与记忆、关系功能可以分别使用。
