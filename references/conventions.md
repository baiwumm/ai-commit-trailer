# Trailer 语义与 GitHub 规则

## 四种 trailer 的分工

| Trailer | 谁解析 | 语义 | 是否要邮箱 |
| --- | --- | --- | --- |
| `Co-authored-by` | GitHub、GitLab | 共同作者，共担著作权与责任 | 必须 `Name <email>`，且邮箱要绑定账号 |
| `Assisted-by` | 无（纯文本） | 披露协助者，不主张著作权 | 不要求，惯例写 `Host:model` |
| `Generated-by` | 无（纯文本） | 声明几乎全部由工具生成（Mesa 惯例） | 不要求 |
| `Signed-off-by` | DCO 检查工具 | 法律意义上的签署，不是 AI 披露 | 需要，但含义完全不同 |

**只有 `Co-authored-by` 会被 GitHub 解析。** 它出现在提交页的多作者区、计入仓库 Contributors、进入个人贡献图；`Assisted-by` 等其它 trailer 只在 `git log` 原文里可见，GitHub 界面完全不显示。

## GitHub 识别 `Co-authored-by` 的条件

1. 位于**提交信息末尾的 trailer 区块**：正文后空一行，若干条 `Key: value` 连续排列，中间不能夹空行。
2. 值必须是 `Name <email>` 形式。只写名字不会生效。
3. 邮箱要绑定在一个 GitHub 账号上，才会显示头像并链接。未绑定的邮箱仍会显示名字，但不产生账号关联。
4. trailer key 大小写不敏感，`Co-Authored-By` 与 `Co-authored-by` 等价。

最稳的邮箱形式是 `<login>@users.noreply.github.com`，它天然绑定登录名对应的账号。厂商域名邮箱（如 `noreply@pi.dev`）也能生效，前提是该邮箱已注册在对应账号上——这一点必须实测，不能假设。

## 怎么验证某个邮箱能否关联

不要凭猜测填表。两种实证方式：

1. **看 Contributors**：推送若干条带该 trailer 的提交后，仓库首页 Contributors 区域是否出现对应账号。
2. **看提交页**：提交详情里 co-author 的名字是否带链接和头像。

注册表 `references/agents.json` 的 `linked` 字段记录的就是这个结论：

- `verified` — 真实仓库里实测出现过
- `documented` — 有官方文档或社区实测记录，但未在本机验证
- `inferred` — 按厂商域名推断，未证实

## 常见错误

| 写法 | 问题 |
| --- | --- |
| `Co-authored-by: ZCode` | 没有邮箱，GitHub 不解析 |
| `Co-authored-by: ZCode <agent@zcode>` | 邮箱无域名，不合法 |
| `Co-authored-by: Trae (GLM-4.6) <...>` | 模型名进了人名，GitHub 会把它当成人名显示 |
| 同一个 agent 多种写法 | 贡献者统计碎片化，无法归并 |
| trailer 前没有空行 | 被当成正文，不解析 |

## 模型信息放哪

模型名不带进 `Co-authored-by` 的 Name，用 `Assisted-by` 承载：

```text
Co-authored-by: Trae <trae-agent@users.noreply.github.com>
Assisted-by: Trae Agent:GLM-4.6
```

`Assisted-by` 的值建议用 `Host:model` 形式，机器可解析，也便于事后按模型聚合。

## Squash 合并

压缩合并时不要假设源分支提交里的 trailer 会被自动带过去。以 PR 描述里显式写出的 `Co-authored-by` 为准，合并后回到提交页确认一次。
