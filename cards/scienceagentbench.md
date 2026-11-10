# ScienceAgentBench: Toward Rigorous Assessment of Language Agents for Data-Driven Scientific Discovery

从已发表研究提取 102 个科学数据任务，以独立 Python 程序为统一产出，同时检查执行、任务结果、代码相似度和 API 成本。

- 作者：Ziru Chen, Shijie Chen, Yuting Ning, Qianheng Zhang, Boshi Wang, Botao Yu, Yifei Li, Zeyi Liao, Chen Wei, Zitong Lu, Vishal Dey, Mingyi Xue, Frazier N. Baker, Benjamin Burns, Daniel Adu-Ampratwum, Xuhui Huang, Xia Ning, Song Gao, Yu Su, Huan Sun
- 年份：2024 · 类型：benchmark
- 主题：Agent 评测 · 背景
- [原文](https://arxiv.org/abs/2410.05080v1) · 收录：2026-11-10 · 更新：2026-11-10

归类依据（知识库分析）：任务来自科学数据工作流，保留在 Agent 评测背景；输出 Python 程序并不构成 RSI 或 LLM 内部解释贡献，不强行赋研究子类。

## 研究问题

语言 Agent 能否完成科学工作流中的数据处理、建模、分析和可视化任务？作者主张在讨论端到端科研自动化之前，先测量这些具体环节的完成能力。基准从 44 篇同行评审论文提取 102 个任务，覆盖四个学科。

证据：e1

## 原有做法与缺口

只用整篇生成论文的整体评价，很难判断 Agent 是否真正具备基础的数据工作能力；抽象问答和少量代码补全也不足以代表实际科学任务。本文将实际论文中的程序任务整理成统一输入输出，并邀请领域专家检查其真实性与合理性。

证据：e1, e9

## 核心方法

每个任务提供自然语言目标、数据目录与预览，以及可选的专家知识，要求生成可独立执行的 Python 文件。评测先检查运行与保存文件，再用任务专用脚本验证结果；图像结果由 GPT-4o 对照参考图评分。另报 CodeBERTScore 和 API 费用，并用五阶段专家 rubric 补充人工评价。

证据：e2, e4, e8

## 一个具体例子

图 2 和表 1 的 ClinTox 任务要求读取分子数据，训练预测药物毒性与 FDA 批准状态的模型，并输出带分子 SMILES 和预测概率的 CSV。程序运行和输出路径须正确，训练结果还须达到测试集 ROC-AUC ≥ 0.77 的标准。能生成代码、能运行和达成科学任务目标在这里是不同层次。

证据：e2, e3, e4

## 输入与产出

输入是任务说明、真实研究数据及可选领域知识；产出是一个独立 Python 源文件和指定预测、表格或图像。任务覆盖生物信息学、计算化学、地理信息科学，以及心理学与认知神经科学。数据、程序和评分规则经过标注者及九位领域专家的多轮验证。

证据：e1, e2, e9

## 关键结果与实验条件

本文记录 arXiv v1 的结果，不混用后续版本：五个模型分别配合直接提示、OpenHands CodeAct 和 Self-Debug。每任务独立运行三次，主表按 SR、VER、CBS、成本的优先级选择最佳一次；Claude-3.5-Sonnet + Self-Debug 的任务成功率为无专家知识 32.4%、有专家知识 34.3%。附录 D 另报三次运行的均值和标准差，因此主表结果不能当成单次平均成功率。

证据：e5, e6

## 主要贡献

将来自真实研究论文的异构科学任务统一为完整程序生成问题，并提供任务专用验证。多轮专家核查、执行结果与成本联合报告，以及补充的过程 rubric，让读者能区分可运行性与实际任务完成。贡献是评测任务集和协议，不是已实现自主科研的系统。

证据：e1, e4, e9

## 局限与适用边界

附录 A 明确限定为科学数据任务的代码生成，不覆盖文献总结、实验规划或整个研究生命周期。任务只收 Python，并为评测效率优先选择参考程序十分钟内可完成的任务；学科覆盖也受可用数据和专家限制。作者承认代码相似度与图像模型评审不完美，因此不能将得分直接推广到所有科学能力。

证据：e7, e8

## 成本与复现条件

v1 表 3 中，无专家知识时 Claude-3.5-Sonnet 的 Self-Debug API 成本为每任务 $0.057，OpenHands 为 $0.958；这些是论文当时设置下的成本记录。程序环境需要按依赖动态配置；参考程序十分钟内完成的筛选条件，不等同于所有 Agent 的运行时间限制或今天的 API 价格。

证据：e6, e7

## 与研究主题的关系

知识库分析：作为科研 Agent 与代码 Agent benchmark 的例子，它适合说明任务来源、专家验证、执行检查和成本报告如何结合。阅读时可先看 §2.3 的指标定义、表 3 的配置差异及附录 D 的均值，再判断论文结果对应哪种运行口径。

证据：e4, e5

## 原文证据

### e1 · 摘要：任务来源与规模 · 来源页 1

> 102 tasks from 44 peer-reviewed

### e2 · 图 2 与 §2.1：任务输入输出 · 来源页 3

> Clintox dataset

### e3 · 表 1：ClinTox 成功标准 · 来源页 5

> ROC-AUC score on the test set

### e4 · §2.3：执行与结果指标 · 来源页 5

> Valid Execution Rate (VER)

### e5 · §3：三次运行和主表选择规则 · 来源页 7

> three independent runs

### e6 · 表 3：Self-Debug 主结果 · 来源页 8

> 32.4 86.4 92.2 0.057

### e7 · 附录 A：范围与任务时长限制 · 来源页 22

> within 10 minutes

### e8 · §2.3 · Figure Evaluation · 来源页 5

> sample 3 responses

### e9 · §2.2 · Expert Validation · 来源页 4

> nine subject matter experts

## 相关论文

暂无明确关联的已收录论文。
