# 卡片数据契约 · v1

`papers/<id>.json` 为唯一数据来源。使用 prepare 自动生成草稿，只需填内容，不手拼来源信息。

| 字段 | 内容 |
|---|---|
| schema_version | 固定 1 |
| id | 稳定英文小写短横线名称，修订保持 id |
| origin | user 表示用户提交；example 表示初始化示例，网页明确标识 |
| title, authors, year | 经原文核对的标题、作者数组、年份 |
| paper_type | benchmark / method / framework / dataset / analysis / survey / position |
| topics | config.json 中的主题 id 数组，多标签 |
| tags | 自由关键词数组，供搜索使用 |
| one_liner | 一句话恢复本文机制和目标 |
| added_at, updated_at | YYYY-MM-DD；更新保留首次收录日期 |
| source | url、sha256、format、page_count、attachment，由提取步骤生成 |
| read_scope | 只有 full 可发布；全文不足留在 inbox |
| sections | 固定十个字段，每个是 text 和 evidence 数组 |
| evidence | 至少三处：id、page、locator、quote |
| related | 数组，每项 id、reason，id 必须存在 |
| review | evidence_checked、compression_checked、reviewed_by、prompt_version |

sections 的十个 key：problem / gap / method / trace / inputs_outputs / results / contributions / limitations / cost / relevance。前八个字段必须引用至少一处 evidence，cost 若未报告可明确说明；relevance 是知识库分析。未知项也需要实质说明，不留空。

例：`{"text":"该基准使用自动检查器评估工具调用结果，并报告任务成功率。", "evidence":["e2"]}`。

证据例：`{"id":"e2", "page":3, "locator":"§3 · Evaluation", "quote":"database state"}`。PDF page 是物理页号，不是印刷页码。HTML/text 统一 page=1，locator 必须说明章节或表格。quote 从 fulltext.txt 原样短摘录，允许空白规范化，不能改写为译文。引用长度至少八个字符。

finalize 会增加 `review.evidence_verified_sha256`，表示摘录已与该版本的本地提取来源匹配。它不是论文结论的语义证明。CI 不需要重新下载所有论文；复核新卡片的来源发生在 finalize。

修改已收录论文：prepare --update → 改草稿 → finalize --update → 检查 Git diff。来源版本通过 sha256、来源 URL 和 Git 历史追踪；不同版本不混合数据。
