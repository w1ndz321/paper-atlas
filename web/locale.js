/* Language resources and pure data localization. */
"use strict";
let language = "zh";
const englishUI = {
  "展开分类": "Expand categories", "收起分类": "Collapse categories",
  "清空": "Clear", "重置筛选": "Reset filters", "整理状态": "Reading status", "全部内容": "All content",
  "精读卡片": "Full-text card", "文献索引": "Reading-list entry", "文献索引 · 待精读": "Reading-list entry · Not yet reviewed",
  "查看文献": "View entry", "阅读卡片": "Read card", "为什么放在这里": "Why it is included",
  "来源核对": "Source checked", "在新标签页打开": "Opens in a new tab",
  "这是根据官方论文页整理的阅读线索，尚未完成全文精读。方法细节、实验结果与适用边界请以原文为准。": "This reading-list entry is based on the official paper page, not a full-text review. Consult the original for methods, results and limitations.",
  "评测基准": "Benchmark", "方法": "Method", "框架": "Framework",
  "数据集": "Dataset", "分析研究": "Analysis", "综述": "Survey", "观点论文": "Position paper",
  "全部论文": "All papers", "研究主题": "Research topics", "专题": "Collections",
  "专题介绍": "About this collection", "问题导航": "Explore by question",
  "如果你想问的是……": "What would you like to know?", "从这里开始": "Start here",
  "主题说明与阅读建议": "About this topic and suggested reading", "建议阅读": "Suggested reading",
  "篇": "papers", "示例论文": "Example paper", "收录": "Added", "更新": "Updated",
  "这里还没有论文。在 Codex 中提供方向之外感兴趣的文章，并要求收录即可。": "No papers here yet. Give Codex a paper you find interesting and ask to add it.",
  "这个分类下暂无匹配论文。可以查看其他分类或修改关键词。": "No matching papers. Try another category or change your search.",
  "← 返回论文列表": "← Back to papers", "没有找到这篇论文": "Paper not found",
  "链接可能已变更，请返回列表查找。": "This link may have changed. Return to the library to find the paper.",
  "阅读原文 ↗": "Read the original ↗", "文章大纲": "On this page",
  "研究问题": "Research question", "原有做法与缺口": "What was missing",
  "核心方法": "How it works", "一个具体例子": "A worked example", "输入与产出": "Inputs and outputs",
  "关键结果与实验条件": "Results and experimental setup", "主要贡献": "Contributions",
  "局限与适用边界": "Limitations", "成本与复现条件": "Cost and reproducibility",
  "与研究主题的关系": "Research context", "相关论文": "Related papers",
  "暂无明确关联的已收录论文。": "No related papers have been linked yet.",
  "知识库暂时无法加载。请刷新重试，或在 GitHub 查看卡片。": "The library could not be loaded. Refresh this page or read the cards on GitHub.",
  "使用说明": "How to use", "全部类型": "All types", "最近收录": "Recently added",
  "发表年份": "Publication year", "标题排序": "Title", "文章类型": "Paper type", "排序": "Sort by",
  "正在读取知识库…": "Loading the library…",
  "按主题查阅论文的方法、结果与主要贡献。": "Explore papers by topic, method and findings.",
  "论文收录": "Adding papers", "在 Codex 中开始。": "Start in Codex.",
  "在 Codex 中打开这个仓库，上传 PDF 或提供论文链接，然后说：": "Open this repository in Codex, upload a PDF or share a paper link, then ask:",
  "阅读这篇论文，按仓库规范收录并同步到 GitHub。": "Read this paper, add it to the library following the repository guidelines, and sync it to GitHub.",
  "Codex 会阅读全文、整理关键信息，并更新这里的索引。无需另外写笔记，也无需配置模型 API。": "Codex reads the full paper, writes a summary and updates this library. You can do this directly in the conversation, with no separate notes or model API setup.",
  "查看仓库说明 ↗": "Read the repository guide ↗", "关闭": "Close",
  "搜索问题、方法、指标或结论…": "Search questions, methods, metrics or findings…",
  "搜索论文全文卡片": "Search paper cards", "主题与分类目录": "Topics and categories",
  "研究主题与分类维度": "Research topics and facets", "专题与兴趣探索": "Collections and interests",
  "展开或收起分类目录": "Open or close the topic menu", "论文列表": "Paper library",
  "当前位置": "Current location", "主题导读": "Topic guide", "论文详情": "Paper details",
  "Paper Atlas 首页": "Paper Atlas home", "论文知识库": "Paper library",
  "英文翻译待补充": "English translation pending",
  "双语全文": "Bilingual full text",
  "双语对照全文 →": "Side-by-side translation →",
  "← 返回卡片": "← Back to card",
  "同步滚动": "Sync scroll",
  "同步滚动：开": "Sync scroll: On",
  "同步滚动：关": "Sync scroll: Off",
  "打开本地 PDF": "Open local PDF",
  "适应宽度": "Fit width",
  "正在加载原文 PDF…": "Loading original PDF…",
  "正在加载中文全文译文…": "Loading Chinese full-text translation…",
  "对齐左页": "Align PDF",
  "正文": "Body",
  "图表页": "Figure",
  "参考文献（略）": "References (stub)",
  "附录提示词": "Appendix prompt",
  "公式推导": "Math proof",
};
function t(text) {
  return language === "en" ? englishUI[text] || text : text;
}
function preferredLanguage(search, storage) {
  const requested = new URLSearchParams(search).get("lang");
  if (["zh", "en"].includes(requested)) return requested;
  try {
    return storage.getItem("paper-atlas-language") === "en" ? "en" : "zh";
  } catch {
    return "zh";
  }
}
function localizeData(original, locale) {
  const result = JSON.parse(JSON.stringify(original));
  if (locale !== "en") return result;
  const labels = original.config.translations?.en || {};
  const translate = (value) => {
    if (typeof value === "string") return labels[value] || value;
    if (Array.isArray(value)) return value.map(translate);
    if (value && typeof value === "object")
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, translate(item)]));
    return value;
  };
  result.config = translate(result.config);
  result.sections = Object.fromEntries(
    Object.entries(result.sections).map(([key, label]) => [key, englishUI[label] || label]),
  );
  for (const paper of result.papers) {
    const translated = paper.translations?.en;
    if (!translated || translated.source_sha256 !== paper.source.sha256) continue;
    paper.one_liner = translated.one_liner;
    for (const [key, section] of Object.entries(paper.sections))
      section.text = translated.sections[key];
    for (const related of paper.related) related.reason = translated.related[related.id];
    for (const evidence of paper.evidence) evidence.locator = translated.locators[evidence.id];
  }
  return result;
}
