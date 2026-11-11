# Paper Atlas

按主题与维度整理的论文知识库，整理方法、结果与贡献。

[打开 Paper Atlas 网站](https://w1ndz321.github.io/paper-atlas/)

在 Codex 打开仓库，提供 PDF 或链接，说“阅读、收录并同步到 GitHub”。网页自动更新。

网站区分“精读卡片”和“文献索引”：前者包含全文整理与原文位置，后者是核对官方来源后加入的阅读线索，尚未完成精读。列表可按整理状态筛选。分类随文章内容整理，只显示有文章的类别；未核对细分归类的文章放在各维度的“待核对分类”入口，不会从分类目录中遗漏。

`papers/` 保存精读卡片，`reading_lists.json` 保存检索条目及主题清单。同一篇论文精读后保留原链接，不重复展示。

下载的原始 PDF 保存在独立的 [`pdfs/`](pdfs/README.md) 文件夹，以论文 id 命名；[`manifest.json`](pdfs/manifest.json) 记录来源、文件哈希和页数。本地 PDF 不上传 GitHub，网站保留官方原文链接。仅有 HTML 全文的文章保留网页来源。

界面的链接、按钮、筛选与状态遵循统一的[交互约定](docs/interaction.md)，附有设计指南来源。
