# NatureBench: Can Coding Agents Match the Published SOTA of Nature-Family Papers?

将 Nature 系列论文转为 90 个容器化科研任务，隐藏源方法，让编码 Agent 独立求解，并以相对已发表 SOTA 的差距评分。

- 作者：Yuru Wang, Lejun Cheng, Yuxin Zuo, Sihang Zeng, Bingxiang He, Che Jiang, Junlin Yang, Yuchong Wang, Kaikai Zhao, Weifeng Huang, Kai Tian, Zhenzhao Yuan, Jincheng Zhong, Weizhi Wang, Ning Ding, Bowen Zhou, Kaiyan Zhang
- 年份：2026 · 类型：benchmark
- 主题：Agent 评测 · 背景
- [原文](https://arxiv.org/abs/2606.24530v1) · 收录：2026-11-10 · 更新：2026-11-10

## 研究问题

编码 Agent 在只获得科学问题、数据和交付要求时，能否达到或超过已发表论文的结果？NatureBench 将评测目标放在独立求解科学任务，而不仅是照着论文复写方法。v1 共 90 个任务，涵盖细胞组学、蛋白质、生物医学建模、物理建模、分子设计和关系推理。

证据：e1

## 原有做法与缺口

现有论文复现任务主要测实现已知方法，部分工程基准又缺少自然科学场景与稳定可重跑环境。作者通过统一任务包与隐藏源方法，尝试把科研问题、运行环境、评分器和已发表结果锚点放进同一协议。

证据：e1, e2

## 核心方法

NatureGym 依次执行论文筛选、数据获取验证和任务包构建，每阶段都有审查与修复。Agent 只看到任务说明和输入数据，参考答案与评测器留在宿主服务；提交后返回评分反馈。每个实例按 g = dir × (m − m_sota) / |m_sota| 计算相对差距，再汇总任务内实例；g ≥ 0 记作 Match-SOTA，g > 0.1 记作 Surpass-SOTA。

证据：e2, e3

## 一个具体例子

图 5 与附录 C 的癌基因识别任务提供生物网络邻接矩阵、64 维多组学特征、训练/验证标签和测试掩码，要求给测试节点输出 predictions.npy。隐藏评测器计算 AUPRC 并与源论文对比；Claude Opus 4.7 经图模型、集成与训练优化后，该案例最佳聚合差距为 g=0.17666。这个案例说明任务如何从数据输入走到可对标得分，不代表整篇源论文都已被复现。

证据：e5, e8

## 输入与产出

输入是隔离环境里的问题说明、数据描述和数据文件；产出是可执行方案、预测或其他约定提交文件。评测服务保存隐藏参考答案、指标和 SOTA 锚点；运行后还用模型评审检查伪造输出或利用反馈等捷径。任务包、环境流水线与公开榜单共同构成项目交付物。

证据：e2, e3, e5

## 关键结果与实验条件

这里固定使用 arXiv v1，不引用持续更新的在线榜单。十个模型配置分别通过 Claude Code、Codex CLI 或 Gemini CLI 执行，禁用网页搜索，每任务四小时并按需求分配 GPU。表 4 最强 Claude Opus 4.7 的 Surpass-SOTA 为 17.8%、Match-SOTA 为 47.8%；达到指标不自动等于提出新科学方法。

证据：e3, e4

## 主要贡献

提供从论文到可重跑科研任务包的 NatureGym，以及以论文报告结果为锚点的跨学科 benchmark。评测将有效提交、指标达标和运行后的捷径审查组合起来，既报告得分，也分析方法选择和执行资源方面的失败。

证据：e1, e2, e3

## 局限与适用边界

任务只覆盖可自动评分、数据可获得且能被环境封装的研究部分；论文明确提醒其分数代表保留切片，不代表整篇源论文。公开数据和迭代评分反馈仍有泄漏与投机风险，协议以禁用搜索及事后模型检查约束。相对差距遇到很小的 SOTA 分母时会放大误差，均值可能有重尾，因此还须看阈值成功率和中位数。

证据：e3, e6

## 成本与复现条件

统一时间预算为每任务四小时，评分期间暂停计时；90 个任务中，3 个仅用 CPU，70 个分配单张 RTX 3090/4090，17 个分配单张 A800。附录 D 报告有效且有使用记录的运行成本，例如 Claude Opus 4.7 平均 API 成本 $21.65；这不包含全部机器费用，也不是当前报价。

证据：e3, e7, e9

## 与研究主题的关系

知识库分析：这是科研编码 Agent benchmark 的实例，适合查看任务构建、可重跑环境、隐藏评分与论文结果对标的完整链条。与 ScienceAgentBench 对照时应保留两者目标不同：满足任务专用标准，与达到源论文 SOTA，不能直接视为同一难度或同一指标。

证据：e1, e3

## 原文证据

### e1 · §1：规模与项目目标 · 来源页 3

> 90 tasks

### e2 · §2.1：NatureGym 流程 · 来源页 4

> three stages

### e3 · §3.4：评分与预算 · 来源页 12

> 4-hour wall-clock budget

### e4 · 表 4：固定版本主结果 · 来源页 13

> 17.8 47.8

### e5 · 图 5：癌基因任务提交 · 来源页 11

> predictions.npy

### e6 · §5.3 · Task coverage · 来源页 18

> only a bounded slice

### e7 · 附录 D 表 11：API 成本 · 来源页 34

> 24.25M179.3K $21.65

### e8 · 附录 C 表 8：案例最佳结果 · 来源页 32

> 𝑔=0.17666

### e9 · §4.1：硬件分配 · 来源页 13

> single NVIDIA A800

## 相关论文

- [scienceagentbench](scienceagentbench.md)：均从已发表科学研究构建程序任务；ScienceAgentBench 检查具体任务成功，NatureBench 以源论文报告的 SOTA 为对标目标。
