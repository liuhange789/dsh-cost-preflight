# dsh-cost-preflight

**你在点发送之前，就该知道这条消息大概有多贵。**
*Know roughly how expensive a message is before you hit send.*

A pre-send cost-tier preflight for [DSH](https://github.com/deepseek-ai/dsh) (DeepSeek Harness). It does not bill tokens — it scores four observable signals in your draft and shows 🟢低 / 🟡中 / 🔴高 next to the send button, plus a one-line warning above the composer when the task looks expensive. All analysis is local string processing; no LLM call, no data leaves the browser.

这是一个「事前」而不是「事后」的成本插件：它不统计已花掉多少 token，而是在你按下发送前，根据消息本身的四个客观信号给出成本档位预警。

## 它长什么样

| 位置 | 内容 |
| --- | --- |
| 发送按钮旁（`conversation.input.right`） | 一个很小的档位标签：🟢 低 / 🟡 中 / 🔴 高；鼠标悬停显示命中的信号 |
| 输入框上方（`conversation.input.dock`） | 仅高成本时出现一行：`此任务预计消耗较高，建议确认任务范围后发送（…信号…）` |
| 设置 → 插件 → 成本预检 | 启用开关 + 宽松 / 标准 / 激进三档灵敏度，实时生效 |
| 工具 `cost_preflight` | 无界面场景（CLI / headless / 模型自主判断）可直接调用，返回 JSON 档位结果 |

## 启发式规则（固定，不随灵敏度改变）

| 信号 | 命中条件 | 加分 |
| --- | --- | --- |
| 长消息 | 去除首尾空白后超过 **500** 字（按 Unicode 码点计） | +1 |
| 多步指令 | 含 `循环 / 遍历 / 逐个 / 所有 / 批量 / 接着 / 然后 / 之后` 之一 | +1 |
| 多文件引用 | 去重后的文件路径数量 **> 3** | +1 |
| 测试/部署 | 含 `测试 / 验证 / 部署` 之一 | +1 |

路径识别接受 Windows 盘符、`./`、`../`、`~/`、绝对路径，以及带扩展名的相对路径；URL、`2026/11/16` 这类斜杠日期和裸 `a/b` 不会计数。同一路径写两次只算一次。

档位切线（分数 0–4）：

| 灵敏度 | 低 | 中 | 高 |
| --- | --- | --- | --- |
| 宽松 loose | 0–2 | 3 | 4 |
| 标准 standard（默认） | 0–1 | 2 | 3–4 |
| 激进 aggressive | 0 | 1 | 2–4 |

灵敏度只移动切线，不改四条信号——所以同一个输入在不同档位下分数始终一致，只有档位标签变化。

## 安装

需要 DSH `0.1.0-rc.7`（本插件按该版本的真实运行时契约开发，不兼容 0.0.1-rc.x）。

```powershell
# 1. 装进某个 profile（会转发给 pnpm）
dsh plugin --profile web add @liuhange/dsh-cost-preflight

# 2. 在该 profile 的用户层启用它：编辑 $DSH_HOME/profiles/web/cordis.patch.yml
```

```yaml
- insert:
    - id: cost-preflight
      name: '@liuhange/dsh-cost-preflight'
```

```powershell
# 3. 确认组合树里出现了 cost-preflight，然后重启 DSH
dsh --profile web --dump-config
```

依赖：宿主侧 `@deepseek-ai/dsh-tools`、`@deepseek-ai/dsh-settings`、`@deepseek-ai/schemastery`（DSH 自带）；客户端使用 shell 提供的 `react` / `react/jsx-runtime`，无需额外安装。没有设置服务时插件照常工作（默认启用、标准灵敏度）；没有 `tools` 服务时工具部分不会挂载，但界面部分不受影响。

## 配置

两种等价方式：

1. 界面：设置 → 插件 → 成本预检（写入 `cost-preflight` 设置命名空间，立即生效）。
2. 组合层：在 `cordis.patch.yml` 的条目里带 `config`：

```yaml
- insert:
    - id: cost-preflight
      name: '@liuhange/dsh-cost-preflight'
      config:
        enabled: true
        sensitivity: standard
```

非法值有兜底：`sensitivity` 不是三档之一时回落到 `standard`，并在工具结果的 `sensitivityFallback` 里标出；`enabled` 不是布尔值时回落到 `true`。`enabled: false` 会隐藏标签和提示，但 `cost_preflight` 工具仍然可用（它只在你显式调用时执行，不产生噪音）。

## 工具 `cost_preflight`

```jsonc
{
  "text": "把 src 下所有测试逐个跑一遍，然后修掉失败项，最后部署",
  "sensitivity": "standard"   // 可选，覆盖当前配置
}
```

返回字段全部声明在 `output.schema` 中并有 `output.render` 文本渲染：`tier`、`score`、`sensitivity`、`sensitivityFallback`、`characterCount`、`pathCount`、`thresholds`、`signals[]`、`advice`、`tierLabel`。`execute` 返回对象、无副作用、并发安全。

## 验证范围（如实说明）

已真实验证（DSH `0.1.0-rc.7` 本机运行时）：

- 规则与档位：`node --test` 20 项单测全过，覆盖四条信号、500 字边界、3/4 路径边界、三档灵敏度、非法值兜底、500ms 防抖与重复草稿去重。
- 宿主装载与工具：新建临时 profile 经 `cordis.patch.yml` 装载，真 `dsh --profile cp-verify "<任务>"` 会话中模型实际调用 `cost_preflight`，返回 `tier=medium, score=2`（命中「逐个」「测试」），工具 schema/render 全程通过真实 `ToolRuntime`。
- 客户端发现与服务：同一临时 web profile 启动后，`window.__DSH_BOOT__` 包含本包条目，`GET /plugins/@liuhange/dsh-cost-preflight/client.js` 返回 200。
- 真实浏览器行为：在运行的 web UI 中输入高成本任务文本，发送按钮旁出现 🔴高 标签、输入框上方出现红色提示行；在设置 → 插件中打开「成本预检 · Cost Preflight」卡片，把灵敏度切到「宽松」后，同一文本的标签实时变为 🟡中 且提示行消失。
- 设置命名空间：宿主注册、客户端 `settingsScope.bind({namespace})` 读写同一命名空间，保存失败会显示错误行。

未验证 / 受环境限制：

- 不做精确 token 计费：档位是启发式预警，与真实账单没有数值映射。
- 非 Web 形态（纯 CLI/headless）没有输入框，因此只有工具、没有发送前标签；这是宿主侧能力边界，不是缺陷。
- 样式是本插件自绘的内联样式，未做多主题逐像素核对（深浅色下均使用半透明背景与 `currentColor` 文字，未强制写死主题色）。

## 查过但没有采用的入口

- 宿主事件：`agent/session-start`、`agent/status`、`agent/inbox/inserted`、`agent/pre-step`、`tools/pre-execute` 都真实存在，但最早也是在消息已提交后（`inbox/inserted`）或模型调用前（`pre-step`）才能拿到文本 —— 没有「发送前拦截」的宿主事件，因此“事前”只能由客户端输入区槽位完成。
- `ctx.ui.*`、`ctx.expose`、`ctx.push`、`ctx.config.read` 在 `0.1.0-rc.7` 中不存在，本插件一个都没用。
- PTC / 并行工具调用插件：运行时代码里没有名为 PTC 的能力（只有一个 `maxParallelToolCalls` 设置项，默认已开启并行），因此没有做 PTC 联动提示，也不在界面上提。

## License

MIT © liuhange
