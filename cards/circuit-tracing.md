# Circuit Tracing: Revealing Computational Graphs in Language Models

以跨层转码器替代 MLP，用提示相关的归因图连接内部特征，再以干预检验图所描述的机制。

- 作者：Emmanuel Ameisen, Jack Lindsey, Adam Pearce, Wes Gurnee, Nicholas L. Turner, Brian Chen, Craig Citro, David Abrahams, Shan Carter, Basil Hosmer, Jonathan Marcus, Michael Sklar, Adly Templeton, Trenton Bricken, Callum McDougall, Hoagy Cunningham, Thomas Henighan, Adam Jermyn, Andy Jones, Andrew Persic, Zhenyi Qi, T. Ben Thompson, Sam Zimmerman, Kelley Rivoire, Thomas Conerly, Chris Olah, Joshua Batson
- 年份：2025 · 类型：method
- 主题：LLM 可解释性
- [原文](https://transformer-circuits.pub/2025/attribution-graphs/methods.html) · 收录：2026-11-10 · 更新：2026-11-10

- 子类：计算路径与电路

归类依据（知识库分析）：主要产出是连接特征与输出的计算路径和归因图，并检验路径的干预预测，归计算路径与电路。

## 研究问题

发现单个可解释特征后，如何进一步解释这些特征怎样相互作用而产生答案？本文以小型 18 层模型的方法实验为主，并在部分案例中使用 Claude 3.5 Haiku。目标是可检验的计算链，而不只是概念列表。

证据：e1

## 原有做法与缺口

神经元多义、特征跨层重复，逐层分析会产生冗长电路；普通 SAE 重构状态也未显式描述特征之间的计算。即使替代网络输出接近原模型，也可能使用另一套机制，因此“画出图”和“验证图”必须分开。

证据：e1, e6

## 核心方法

训练 CLT：特征从某层残差流读入，可写入本层及更后层的 MLP 输出。给定一个 prompt，固定原模型的注意力模式及归一化分母，加入重构误差节点，得到局部替代模型；计算特征之间对输出的线性归因，剪枝、分组，再在原模型中干预特征检验预期影响。

证据：e1, e2, e6

## 一个具体例子

输入虚构机构名称 National Digital Analytics Group，并已给出缩写首字母 N。归因图追踪 Digital、Analytics、Group 如何经“输出相应位置字母”的特征影响 DAG 输出。抑制某一词相关特征会抑制对应缩写路径；但为何注意力找到这些词，当前固定注意力的图并不完整解释。

证据：e3, e5

## 输入与产出

输入为可访问激活的目标模型、CLT 训练数据、指定 prompt 与输出 token；产出为 CLT、局部归因图、可视化和干预结果。18 层模型字典总特征约 300K–10M，Haiku 为约 300K–30M；归因图主要针对特定输入，不是全局完整程序。

证据：e1, e3

## 关键结果与实验条件

最大 18L 替代模型在作者选定的预训练式 prompt 分布上约 50% 次数与原模型的首选下一 token 一致；样本限制为原模型答对且置信度低于 80%。CLT 相比逐层转码器改善部分路径长度和图完整性指标。缩写、事实回忆及加法干预大体支持所画路径，但不能由 50% 一致率推出 50% 机制已解释。

证据：e3, e4, e6

## 主要贡献

提供从稀疏特征走向计算图的系统方法，显式保留误差节点并区分局部图、全局权重和真实模型干预。跨层表示可压缩重复计算，配合交互界面使人能够提出并测试较复杂的机制假说。

证据：e1, e2, e6

## 局限与适用边界

不解释注意力 QK 路径，可能遗漏关键计算；重构误差、非活跃特征的抑制作用和特征分裂也会造成盲点。supernode 手工分组费时且有信息损失。即便输出完全匹配，也不保证干预后的响应匹配；长距离机制忠实性仍较差。

证据：e5, e6

## 成本与复现条件

训练跨层字典有显著前期成本，之后才能摊薄到多次分析。推断归因图、剪枝、人工命名与干预验证也有开销。可以用逐层转码器或原神经元替代部分步骤，代价是表示质量和图复杂度不同。

证据：e1, e6

## 与研究主题的关系

知识库分析：理解“特征→电路→干预验证”的核心读物。它能帮助分析候选改进到底改变了什么内部计算，但本文未将电路解释接入自主 RSI，也不证明解释图可作为通用改进奖励。

研究关联分析；未作为论文结论。

## 原文证据

### e1 · Architecture · 跨层转码器 · 来源页 1

> cross-layer transcoder

### e2 · The Local Replacement Model · 条件固定 · 来源页 1

> normalization denominators

### e3 · Attribution Graphs · 缩写例子 · 来源页 1

> National Digital Analytics Group

### e4 · From CLT to Replacement Model · 定量评估 · 来源页 1

> on 50% of

### e5 · Limitations · 注意力机制缺失 · 来源页 1

> Missing Attention Circuits

### e6 · Limitations · 替代模型不等于原机制 · 来源页 1

> Mechanistic Faithfulness

## 相关论文

- [scaling-monosemanticity](scaling-monosemanticity.md)：从识别独立特征进一步解释特征间计算；CLT 与普通 SAE 的训练对象和可解释交互不同。
- [rome](rome.md)：都用内部干预验证解释；ROME 聚焦事实定位与单次编辑，本工作追踪更细粒度的特征路径。
