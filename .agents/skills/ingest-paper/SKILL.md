---
name: ingest-paper
description: 在本仓库中阅读并规范收录用户提交的论文 PDF 或论文链接，生成带原文证据的卡片并更新可检索网页。用于读新论文、收录论文或批量整理已读论文。
---

# 论文阅读与收录

从仓库根目录执行。先读 `config.json` 和 `prompts/summarize.md`，后者包含写作要求、固定结构与数据字段。无需用户笔记或模型 API。

1. 确定本篇简短英文 id。运行 `python scripts/kb.py prepare --id <id> --url <official-url>`，或 `--pdf <user-uploaded-pdf>`。本地 PDF 有官方链接时同时提供 `--url`。程序识别 arXiv 摘要链接并下载 PDF，去除版本号做身份去重。已有论文修订使用同一 id 和 `--update`。
2. 阅读 `.local/<id>/fulltext.txt` 全文，按需分段读取，不因输出截断漏掉实验或限制。PDF 的图、表或公式影响结论时查看原始页；记录公式和评分规则，不能根据破损提取自行补写。核对标题、作者和论文版本。HTML 来源需亲自确认是全文，不是登录页或摘要页。
3. 按 `prompts/summarize.md` 填写 `.local/<id>/draft.json`。至少三处证据，覆盖问题/方法/结果或边界；证据的 page 是提取来源的页号，PDF 时为物理页码。网页来源使用 page=1，并在 locator 写章节/表格。不得在未读完时把 read_scope 标记为 full。
4. 读 `prompts/review.md`，对照原文复核草稿并修正。把证据核查与压缩核查设为 true，记录提示词版本。机器只能验证引用存在，科学语义仍需你核对。
5. 运行 `python scripts/kb.py finalize --draft .local/<id>/draft.json`；修订时加 `--update`。它核验摘录、关联论文、分类和固定章节，并生成 Markdown。错误就修正，不降低校验要求。
6. 批量输入逐篇完成。用 `python scripts/kb.py queue` 检查每篇均为已收录或明确待处理，不能遗漏失败项。阅读期间产出的明确论文间联系写入 related；不要仅靠标题配对。
7. 运行仓库完成检查。遵循根目录 AGENTS.md 的提交授权规则，同步本次新增卡片和附件。GitHub Actions 自动校验并部署网站。最终回复用简短中文给出主要理解、卡片路径/网页链接、收录及同步状态。

遇到扫描件、付费墙、破损文件或缺少关键附录：保留 inbox 任务，向用户说明需要哪一份可读来源；不将摘要扩写为论文事实。证据摘录保持短小；完整提取文本留在忽略目录，网页不发布全文缓存。
