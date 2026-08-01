# Antigravity Rigor Guard

**面向 Google Antigravity 编码 Agent 的失败闭锁式安全护栏与交付验证门。**

[English](README.md)

Antigravity Rigor Guard 不只是提醒 Agent“认真测试”，而是通过 `PreToolUse`、`PostToolUse` 和 `Stop` 三类钩子，把危险命令拦截、执行留痕、测试保护、本地验证、远程 CI 核验和交付声明审计真正接入 Agent 工作流。

> 本项目为独立社区项目，与 Google 无隶属、授权或官方合作关系。

## 它解决什么问题

编码 Agent 常见的问题并不是完全不会写代码，而是容易在交付阶段出现以下情况：

- 强推、重写历史或直接推送主分支；
- 使用 `--no-verify`、`LEFTHOOK=0`、`[skip ci]` 绕过验证；
- 删除、跳过或弱化旧测试；
- 用 `|| true`、`2>/dev/null` 隐藏失败；
- 复用旧的 Commit SHA、CI 结果或交付报告；
- 本地命令刚执行，就声称项目已经全部完成；
- CI 仍在运行，Agent 却提前停止。

Rigor Guard 的目标，是让“是否完成”由真实仓库状态和验证结果决定，而不是由模型自己宣布。

## 核心能力

| 层级 | 功能 |
|---|---|
| `PreToolUse` | 拦截危险 Git / Shell 命令，保护验证契约和审计证据。 |
| `PostToolUse` | 将工具调用的成功或失败状态写入本地审计账本。 |
| 测试保护 | 对比当前分支与基线分支，检测测试文件删除、测试声明删除、新增 `.skip`、`.only`、`#[ignore]` 等行为。 |
| 本地验证 | 执行 `.agents/verification-contract.json` 中配置的真实测试和构建命令。 |
| GitHub 验证 | 确认当前 HEAD 对应的 GitHub Actions 已完成且结论为成功。 |
| 报告审计 | 校验交付报告中的 SHA、CI 状态和完成声明是否与真实状态一致。 |
| Stop 门卫 | 任一必需检查失败或未完成时，返回 `continue`，不允许 Agent 宣布结束。 |

## 工作流程

```text
Agent 发起工具调用
        │
        ▼
PreToolUse 审查
  ├─ allow
  ├─ deny
  └─ force_ask
        │
        ▼
真实执行命令或修改文件
        │
        ▼
PostToolUse 更新审计账本
        │
        ▼
Agent 请求结束任务
        │
        ▼
Stop 验证门
  ├─ 契约完整性
  ├─ 测试保留检查
  ├─ 跳过测试扫描
  ├─ 文档占位内容扫描
  ├─ 本地测试与构建
  ├─ 远程 GitHub Actions
  └─ 报告与回复声明审计
        │
        ▼
allow 或 continue
```

审计账本默认保存在：

```text
~/.gemini/antigravity/rigor-ledger/<conversation-id>/
```

常见 GitHub Token、Bearer Token、API Key、密码等字段会在写入账本前进行脱敏。

## 环境要求

- Node.js 20 或更高版本；
- Git；
- 支持命令钩子的 Google Antigravity；
- 使用 `delivery` 模式时，需要已登录的 GitHub CLI（`gh`）；
- 目标仓库需要配置 GitHub Actions。

## 快速安装

```bash
git clone https://github.com/iancjy-creator/antigravity-agent-rigor-guard.git
cd antigravity-agent-rigor-guard
npm ci
npm run check
npm run install-plugin
```

默认安装位置：

```text
~/.gemini/config/plugins/rigor-guard/
```

仓库中的 `hooks.json` 不包含任何开发者本机路径。安装脚本会根据实际安装目录生成最终钩子配置。

自定义安装目录：

```bash
RIGOR_GUARD_PLUGIN_DIR=/absolute/path/to/rigor-guard npm run install-plugin
```

卸载：

```bash
npm run uninstall-plugin
```

## 给目标仓库添加约束

```bash
cp templates/AGENTS.md /path/to/project/AGENTS.md
mkdir -p /path/to/project/.agents
cp templates/verification-contract.json /path/to/project/.agents/verification-contract.json
```

然后根据目标项目修改验证命令。

### 本地模式示例

```json
{
  "taskType": "local_only",
  "baseBranch": "main",
  "verificationCommands": [
    "npm test",
    "npm run build"
  ]
}
```

`local_only` 会执行契约完整性、测试保护、代码扫描、文档扫描和本地命令，不要求 GitHub Actions。

### 交付模式示例

```json
{
  "taskType": "delivery",
  "baseBranch": "main",
  "requireCleanTreeOnStop": true,
  "requireDraftPr": true,
  "forbidMerge": true,
  "verificationCommands": [
    "npm test",
    "npm run build"
  ],
  "reportGlobs": [
    "docs/deliverables/*.md"
  ]
}
```

`delivery` 在本地检查之外，还要求：

- 当前 HEAD 存在对应的 GitHub Actions Run；
- Run 状态为 `completed`；
- Run 结论为 `success`；
- 核心测试和构建步骤没有被跳过、取消或失败；
- 交付报告中的 SHA 和 CI 状态与真实结果一致。

## 钩子返回值

| 返回值 | 含义 |
|---|---|
| `allow` | 允许执行或允许结束。 |
| `deny` | 直接阻止当前操作。 |
| `force_ask` | 必须获得用户明确确认后才能继续。 |
| `continue` | Agent 当前不能停止，需要继续修复或等待验证。 |

## 默认拦截示例

```text
git push --force
git push --force-with-lease
git reset --hard
git clean -fd
git commit -am
git commit --no-verify
LEFTHOOK=0 ...
... || true
... 2>/dev/null
gh pr merge
gh pr ready
git push origin main
```

同时保护：

- `.agents/`；
- `verification-contract.json`；
- 本地 rigor ledger；
- CI 和交付证据文件；
- 测试目录及核心工作流文件。

## 开发与测试

```bash
npm ci
npm test
npm run check
```

测试套件覆盖危险命令拦截、契约篡改检测、敏感信息脱敏、测试弱化检测、Stop 门验证、可移植安装等进程级演练。

## 安全边界

Rigor Guard 是纵深防御工具，不是操作系统沙箱。

- 命令拦截主要依赖规则和模式匹配；
- 仍应配合最小权限、分支保护、代码审查和 CI Ruleset；
- 本地账本不能抵御拥有同一台机器完整权限的进程；
- 远程验证依赖 `gh` 和目标仓库工作流本身的正确性；
- Antigravity 钩子格式未来发生变化时，项目也需要同步适配。

安全问题请参阅 [SECURITY.md](SECURITY.md)。贡献方式请参阅 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

MIT License，详见 [LICENSE](LICENSE)。
