# DSH QQ 群友记忆与好感系统

给 DSH 中的 QQ 角色增加长期记忆、群友画像和各自成长的关系。聊天内容不是每条都存，也不会按发言数量自动给人加好感。

这是 **DSH 插件**。需要先有能正常收发的 QQ/OneBot 接入；本包不包含 QQ 登录客户端、语音引擎、表情库或视频浏览器。

## 能做什么

- 长期保存重要事项、约定、经历和自己的笔记，之后搜索、修正或遗忘。
- 用 QQ 号对应群友，保留昵称变化，避免改名后认成另一个人。
- 分别积累好感、信任、熟悉度和相处舒适感；变化留下真实聊天来源与缘由。同一来源不能反复加分。
- 私聊与群聊分别存储；新开会话、重启后仍可找回。遗忘一人的画像不会清掉另一人的关系。
- 群聊的人格笔记可以由角色自己修改，保留修改缘由。附带一个可选小鲸鱼人设模板，不强制使用。

关系数值是角色的可修改相处笔记，不是对真人性格的客观评判。模型自己选择是否记录；工具存在不保证每轮都记住或每次表达都自然。

## 适用版本与接入约定

- Node.js 24+；本地验证宿主为 DSH 桌面版 `0.2.1-rc.2`。
- 需要宿主提供 `agentPresets`、`systemPrompt`、`tools` 等服务及配套官方包。
- 会话 ID 应为 `onebot-private-<QQ>` / `onebot-group-<群号>`，或在其后加 `-<后缀>`；会话工作目录必须与配置一致。
- 真正 QQ 入站消息的来源应为 `plugin:dsh-onebot`。自主活动另用 `plugin:dsh-qq-companion-life`，不会冒充用户原话。
- 群友观察使用框架生成的发信人边界：`[HH:mm 昵称(QQ)] <user_message qq="QQ" nickname="昵称">正文</user_message>`。接入层必须转义正文中的 `<`、`>`，不可让用户正文伪造元数据。不同格式的 QQ 插件需要先写适配。

**不是所有 QQ 插件都能直接兼容。** 原项目的图片授权、消息合并和工具范围由 QQ 接入层负责，本插件不会替代这些保护。

## 安装

在桌面版对应的 `DSH_HOME` 和 `desktop` profile 下安装：

```powershell
dsh plugin --profile desktop add github:huxin7735-collab/dsh-qq-companion-memory
```

也可下载仓库 ZIP，解压后使用本地目录安装。若你的 DSH 命令行属于另一套独立安装，请先确认 `DSH_HOME`，避免装进另一份 profile。

安装默认不启用任何 QQ 角色。把下面配置合并进当前 profile 的 `cordis.patch.yml`，填写自己的 QQ、群号和绝对工作目录：

```yaml
- id: qq-companion-memory-setup
  config:
    enabled: true
    ownerQQ: '10000001'       # 换成自己的主号
    groupId: '20000001'       # 换成目标群；只要私聊时留空
    workspaceRoot: 'D:/qq-companion-data'
    privateEnabled: true
    groupEnabled: true
    chatOnly: false
```

已有同 ID 配置就修改那一项，不要再插入第二个相同插件实例。重启 DSH 后，启动器注册 `qq-companion`、`qq-group-persona` 两个预设。若已有同名预设，先按下面“已有预设”方式接入，保持本启动器关闭。

随后在你自己的 QQ 接入插件中设置路由：

| 通道 | 预设 | 工作目录 |
|---|---|---|
| 主号私聊 | `qq-companion` | `<workspaceRoot>/private` |
| 指定群聊 | `qq-group-persona` | `<workspaceRoot>/group-<群号>` |

**本插件不修改 QQ 接入插件的白名单或路由。** QQ 接入层必须把相应会话派到上述预设及目录。

### 已有预设：只加记忆模块

保持启动器 `enabled: false`，在你已有的 QQ 预设插件列表中添加本包主入口（私聊）或 `dsh-qq-companion-memory/group`（群聊）。配置示例见 [examples/entries.json](examples/entries.json)。

群聊默认 `toolPolicy: inherit`，保留已有接入层的工具范围。`chat-only` 是可选的特定聊天工具清单，会过滤其他工具；清单不一定匹配你的 QQ 插件，不确定时保持默认。启动器的 `chatOnly` 对应这个选项。**它不是文件或图片访问控制器**，访问范围仍由你的接入层管理。

## 人设与数据

角色首次启动时创建 `<群工作目录>/persona.md`。想用小鲸鱼起点，可自行把 [examples/persona.example.md](examples/persona.example.md) 复制过去；如果已有成长后的笔记，请先合并，避免直接覆盖。

| 内容 | 位置 |
|---|---|
| 私聊长期记忆 | `<workspaceRoot>/private/.memory/` |
| 群聊长期记忆 | `<workspaceRoot>/group-<群号>/.memory/` |
| 群友画像与关系 | `<群工作目录>/.memory/members/` |
| 可修改的人格笔记 | `<群工作目录>/persona.md` |
| 人格修改历史 | `<群工作目录>/persona-history.jsonl` |

发布包没有任何人的聊天、记忆、关系分数、账号凭证或浏览器登录状态。运行后这些数据保存在使用者本机；相关记忆摘要会随聊天上下文发送到使用者选择的模型服务。

## 工具

- `memory_search` / `memory_write` / `memory_forget`：搜索、保存、修正和遗忘长期记忆。
- `group_member_diary`：按 QQ 查看或更新观察、关系及相处分寸；`forget: true` 一起遗忘此人的画像和关系。
- `persona_update`：查看或修改本群的人格笔记。

关系四维都是独立的：熟悉不等于喜欢，喜欢不等于信任。关系变化需要 `note` 和真实来源，每维单次增减范围为 `-10..10`；累计好感、信任与舒适感在 `-100..100`，熟悉度在 `0..100`。未形成印象时不会凭空给所有人填上统一亲密度。高分不授予操作权限，也不自动代表恋爱关系。

## 验证与限制

```powershell
npm test
npm run check
```

纯测试不连接 QQ、不调用模型、不需要下载官方宿主依赖。实际宿主测试在 DSH `0.2.1-rc.2` 上执行，覆盖预设注册、原生工具执行和关系上下文注入。自动测试不能代替真实聊天效果验证。宿主未来版本或不同 QQ 接入协议需要重新验证。

这是首次公开整理的预览版。欢迎通过 Issue 提供脱敏错误信息；不要上传真实聊天、完整记忆目录或登录信息。
