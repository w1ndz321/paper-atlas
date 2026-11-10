# Natural Language Autoencoders Produce Unsupervised Explanations of LLM Activations

把激活压缩成可读文字，再从文字重构激活，以重构反馈训练解释器，并检验它对模型审计是否有帮助。

- 作者：Kit Fraser-Taliente, Subhash Kantamneni, Euan Ong, Dan Mossing, Christina Lu, Paul C. Bogdan, Emmanuel Ameisen, James Chen, Dzmitry Kishylau, Adam Pearce, Julius Tarng, Alex Wu, Jeff Wu, Yang Zhang, Daniel M. Ziegler, Evan Hubinger, Joshua Batson, Jack Lindsey, Samuel Zimmerman, Samuel Marks
- 年份：2026 · 类型：method
- 主题：LLM 可解释性
- [原文](https://transformer-circuits.pub/2026/nla/index.html) · 收录：2026-11-10 · 更新：2026-11-10

- 子类：内部表征与概念

- 交叉入口：可解释性 × RSI

归类依据（知识库分析）：核心方法解释指定层与 token 的激活内容，归内部表征；用于审计 Agent 的实验证据使其进入交叉入口，不据此宣称已实现自身改进。

## 研究问题

能否直接把高维激活转换为自然语言，从而帮助人和 Agent 调查模型内部在表示什么？传统 SAE 给出固定字典特征，还需额外解释；监督激活问答则要求先知道应该问什么、真值是什么。NLA 希望获得更开放的假说生成接口。

证据：e1, e3

## 原有做法与缺口

直接问模型自身想法可能失真，而监督解释数据只覆盖已知属性。NLA 用激活→文本→激活的重构作为学习信号，但这个信号不直接奖励解释真实或易读：它可能鼓励信息隐藏、抄上下文或看似合理的虚构，因此必须再做任务与干预验证。

证据：e1, e2, e6

## 核心方法

冻结目标模型，AV 接收某层激活并生成文本，AR 把文本还原为该层激活。先用激活—文本摘要代理任务监督热启动，再对 AV 以重构误差的负值做 RL，对 AR 做均方误差回归，并使用 KL 约束。最终主体目标不需要人工激活语义标签，但不等于整个训练完全没有监督初始化。

证据：e1, e2

## 一个具体例子

Opus 4.6 的英文问题偶尔得到俄文回答。NLA 读出模型很早就把用户视作俄语使用者的线索，研究者据此找到英文翻译问题配未翻译外文回答的异常训练数据，并用其他方法佐证。另可编辑解释再经 AR 得到差分方向，检查某个假说对模型行为的因果影响。

证据：e1, e4

## 输入与产出

输入为目标模型激活、AV/AR 初始化模型和预训练式语料；输出为 NLA、可检索自然语言解释及重构激活。报告包含多个 Claude 的解释质量实验、生产模型审计案例、开源模型权重/代码和审计 Agent 工具实验。解释器读取特定层，不是全模型所有状态。

证据：e1, e2, e3

## 关键结果与实验条件

在刻意训练的奖励模型迎合个体上，使用通用数据训练 NLA，Sonnet 4.6 审计 Agent 借助解释发现根因，即便调查时没有目标训练数据。对照中的通用数据 SAE 未可靠提高胜率。Gemma-3-27B 的一个训练实例以两个 8×H100 节点运行约 1.5 天，将方差解释率由 0.38 提到 0.71；重构指标与审计成功是不同证据。

证据：e3, e4, e5

## 主要贡献

将自然语言作为激活重构瓶颈，提供可由 Agent 搜索、聚类和阅读的解释接口；并以独立调查结果而非只靠重构损失评估用途。AV 与 AR 的双向接口也支持通过文字编辑提出内部干预假说。

证据：e1, e3, e4

## 局限与适用边界

AV 本身是黑盒，可能推断出激活未编码的内容，不能定位每句话的机制来源。解释会虚构细节；目标层选错时会漏掉核心信号。训练初始化含有目标模型已有的知识，“通用训练数据”不等于解释器对目标完全无先验；审计个体实验也不等于真实模型都可可靠诊断。

证据：e3, e6

## 成本与复现条件

联合训练两个大型模型昂贵，推断每个激活又约生成 500 token，无法随意覆盖生产训练全部 token。相比 SAE/线性探针，灵活语言接口增加成本与幻觉风险。复现可先用发布的开放模型 NLA，不能把 Claude 审计案例视为完全开放的复现实验。

证据：e5, e6

## 与研究主题的关系

知识库分析：桥接工具，已有“内部解释→调查与独立验证”的证据，是可解释性辅助模型开发的重要近作。但报告没有验证模型根据 NLA 解释自主完成持续改进自身的 RSI 闭环。

研究关联分析；未作为论文结论。

## 原文证据

### e1 · Method · 双模块目标 · 来源页 1

> activation reconstructor

### e2 · Initializing the AV and AR · 监督热启动 · 来源页 1

> text-summarization proxy task

### e3 · Automated auditing · 独立数据条件 · 来源页 1

> only on generic data

### e4 · Auditing results · 实际效用 · 来源页 1

> root cause

### e5 · Discussion and Limitations · 成本 · 来源页 1

> 1.5 days

### e6 · Discussion and Limitations · 解释器边界 · 来源页 1

> black box

## 相关论文

- [scaling-monosemanticity](scaling-monosemanticity.md)：SAE 使用固定稀疏字典；NLA 使用开放文本瓶颈，易供 Agent 阅读但更昂贵且更可能虚构。
- [introspection-adapters](introspection-adapters.md)：IA 报告微调后的行为倾向，NLA 解释指定 token/层的激活，两者训练信号与输出含义不同。
- [sae-latent-attribution](sae-latent-attribution.md)：两者均将内部证据用于诊断；NLA 适合提出开放假说，归因与 steering 提供更限定的因果检查。
