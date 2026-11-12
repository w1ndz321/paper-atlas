# Scaling Monosemanticity: Extracting Interpretable Features from Claude 3 Sonnet

用稀疏自动编码器从 Claude 3 Sonnet 的中层激活分离概念特征，并检查跨语种响应及行为干预。

- 作者：Adly Templeton, Tom Conerly, Jonathan Marcus, Jack Lindsey, Trenton Bricken, Brian Chen, Adam Pearce, Craig Citro, Emmanuel Ameisen, Andy Jones, Hoagy Cunningham, Nicholas L Turner, Callum McDougall, Monte MacDiarmid, Alex Tamkin, Esin Durmus, Tristan Hume, Francesco Mosconi, C. Daniel Freeman, Theodore R. Sumers, Edward Rees, Joshua Batson, Adam Jermyn, Shan Carter, Chris Olah, Tom Henighan
- 年份：2024 · 类型：method
- 主题：LLM 可解释性
- [原文](https://transformer-circuits.pub/2024/scaling-monosemanticity/index.html) · 收录：2026-11-10 · 更新：2026-11-11

- 子类：特征、知识与表征 / 因果干预与模型编辑

归类依据（知识库分析）：用稀疏表征分解研究概念特征，并干预检验行为影响；未构成自主改进闭环。

## 研究问题

单个神经元常对应多个不相关概念，直接看神经元难以解释模型。本文问：小模型上可用的稀疏字典学习，能否扩展到生产级 Claude 3 Sonnet，并得到对抽象概念有意义的内部特征？

证据：e1

## 原有做法与缺口

叠加表示假说认为模型在有限维空间中编码更多概念，神经元坐标不等于语义坐标。已有小模型结果不能保证大模型也能分解；而即使重构损失很低，也不能直接证明这些分解是真正有用的解释。

证据：e1, e4

## 核心方法

在模型中层残差流上训练 SAE：编码器把激活映射到高维、稀疏的非负特征，解码器用少数活跃特征重构原激活。损失结合重构误差与 L1 稀疏惩罚；用缩放实验分配字典大小和训练步数，再依据触发样本、自动解释与激活干预检查特征。

证据：e1, e2

## 一个具体例子

金门大桥特征会在相关描述、不同语言和图像上下文中响应。作者人为放大这一特征后，模型在不相关问题上也倾向谈论桥梁，甚至认同自己是金门大桥。这个例子展示特征可影响输出，也说明过强 steering 会扭曲行为，不是温和、无副作用的控制。

证据：e3

## 输入与产出

输入为 Claude 3 Sonnet 中层残差激活，训练数据是类似部分预训练分布的纯文本；输出为约 1M、4M、34M 特征的字典、激活检索与可视化。研究对象为 2024 年 3 月发布的微调 Sonnet 3.0，不是之后的 3.5 或 3.7。

证据：e1, e2

## 关键结果与实验条件

三种字典平均每 token 活跃特征少于 300，解释至少 65% 的激活方差；34M 字典约 65% 特征在所测样本中死亡。作者观察到多语种、多模态和抽象—具体概念的共同响应，并通过若干 steering 案例验证行为影响。方差解释率不是全模型行为解释覆盖率。

证据：e2, e3

## 主要贡献

将 SAE 特征发现扩展到大型生产模型，提出按算力分配字典训练的经验方法，展示可检索的概念与若干安全相关特征。核心产出是特征层面的观察与干预基础，不是完整电路，也不是安全性认证。

证据：e1, e2, e3

## 局限与适用边界

只研究一个中层位置，远未发现全部特征；跨层叠加、特征分裂、L1 收缩和计算量仍是困难。训练损失是解释性的代理，缺少公认真值。发现“欺骗”或“权力”概念不代表模型有相应意图，更不代表它会实施相应行为。

证据：e4, e5

## 成本与复现条件

需要大规模激活、SAE 训练和特征检查；目标模型权重、尺寸与部分图表单位未公开，完整复现受限。扩大字典不是免费增加解释覆盖，仍要考虑死亡特征与稀有概念的数据效率。

证据：e2, e5

## 与研究主题的关系

知识库分析：理解“神经元→特征”的主流脉络，是后续电路追踪和 SAE 行为调试的基础。可作 RSI 过程审计的工具背景，但本文没有让 Agent 依据特征解释自主迭代改进。

研究关联分析；未作为论文结论。

## 原文证据

### e1 · Scaling Dictionary Learning / Sparse Autoencoders · 来源页 1

> superposition hypothesis

### e2 · Our SAE experiments · 字典规模与重构 · 来源页 1

> fewer than 300

### e3 · Four Examples / Influence on Behavior · 来源页 1

> Golden Gate Bridge

### e4 · Limitations · 解释评估 · 来源页 1

> Inability to Evaluate

### e5 · Limitations · 未发现全部特征 · 来源页 1

> Getting All the Features

## 相关论文

- [rome](rome.md)：ROME 用激活恢复和参数编辑检验事实关联；本工作用稀疏字典分解与 steering 检验概念特征，解释粒度和干预对象不同。
