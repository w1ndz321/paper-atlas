/* Static reader: data.json is compiled from reviewed records, no remote runtime dependencies. */
"use strict";
const $ = (id) => document.getElementById(id);
const typeLabels = {
  benchmark: "评测基准",
  method: "方法",
  framework: "框架",
  dataset: "数据集",
  analysis: "分析研究",
  survey: "综述",
  position: "观点论文",
};
let data;
const params = new URLSearchParams(location.search);
let topic = params.get("topic") || "";
let subtopic = params.get("subtopic") || "";
let collection = params.get("collection") || "";
let savedScroll = 0;
const node = (tag, className, text) => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
};
function link(text, href, className = "", external = false) {
  const el = node("a", className, text);
  const parsed = new URL(href, location.href);
  if (!["http:", "https:"].includes(parsed.protocol)) return el;
  el.href = href;
  if (external) {
    el.target = "_blank";
    el.rel = "noopener noreferrer";
  }
  return el;
}
function updateQuery(push = false, hash = location.hash) {
  const query = new URLSearchParams();
  if ($("search").value) query.set("q", $("search").value);
  if (topic) query.set("topic", topic);
  if (subtopic) query.set("subtopic", subtopic);
  if (collection) query.set("collection", collection);
  if ($("type-filter").value) query.set("type", $("type-filter").value);
  if ($("sort").value !== "added") query.set("sort", $("sort").value);
  history[push ? "pushState" : "replaceState"](
    null,
    "",
    location.pathname + (query.size ? "?" + query : "") + hash,
  );
}
function readView(state) {
  const originalTopic = state.get("topic") || "";
  const requestedTopic = Object.hasOwn(data.config.topic_aliases, originalTopic)
    ? data.config.topic_aliases[originalTopic]
    : originalTopic;
  // Preserve links shared before the cross-entry was separated from Topics.
  collection =
    state.get("collection") ||
    (Object.hasOwn(data.config.collections, requestedTopic)
      ? requestedTopic
      : "");
  if (!Object.hasOwn(data.config.collections, collection)) collection = "";
  topic = Object.hasOwn(data.config.topics, requestedTopic)
    ? requestedTopic
    : "";
  subtopic = state.get("subtopic") || "";
  const category = Object.hasOwn(data.config.subtopics, subtopic)
    ? data.config.subtopics[subtopic]
    : undefined;
  if (category && !topic) topic = category.topic;
  if (!category || category.topic !== topic) subtopic = "";
  if (collection) {
    topic = data.config.collections[collection].topic || "";
    subtopic = "";
  }
}
function selectView(nextTopic = "", nextSubtopic = "", nextCollection = "") {
  topic = nextTopic;
  subtopic = nextSubtopic;
  collection = nextCollection;
  updateQuery(true, "");
  renderTopics();
  renderList();
  showRoute();
}
function filterButton(label, count, active, action, className = "topic") {
  const btn = node("button", className + (active ? " active" : ""));
  btn.type = "button";
  btn.setAttribute("aria-pressed", String(active));
  btn.append(node("b", "", label), node("span", "", String(count)));
  btn.addEventListener("click", action);
  return btn;
}
function renderTopics() {
  const all = { "": "全部论文", ...data.config.topics };
  $("topics").replaceChildren();
  for (const [id, label] of Object.entries(all)) {
    const count = data.papers.filter(
      (p) => !id || p.topics.includes(id),
    ).length;
    $("topics").append(
      filterButton(label, count, topic === id, () => selectView(id)),
    );
  }
  const navigation = $("topics");
  const selected = navigation.querySelector(".active");
  if (selected && navigation.scrollWidth > navigation.clientWidth) {
    navigation.scrollLeft +=
      selected.getBoundingClientRect().left -
      navigation.getBoundingClientRect().left -
      (navigation.clientWidth - selected.offsetWidth) / 2;
  }
  const entries = $("collections");
  entries.replaceChildren();
  const relatedCollections = Object.entries(data.config.collections).filter(
    ([, entry]) => entry.topic === topic,
  );
  entries.hidden = !relatedCollections.length;
  if (!entries.hidden)
    entries.append(node("span", "filter-label", "交叉研究入口"));
  for (const [id, entry] of relatedCollections) {
    const count = data.papers.filter((p) => p.collections.includes(id)).length;
    entries.append(
      filterButton(
        entry.label,
        count,
        collection === id,
        () => selectView(topic, "", id),
        "collection",
      ),
    );
  }
  const children = Object.entries(data.config.subtopics).filter(
    ([, s]) => !collection && s.topic === topic,
  );
  const secondary = $("subtopics");
  secondary.replaceChildren();
  secondary.hidden = !children.length;
  if (children.length) {
    secondary.append(node("span", "filter-label", "子类 · 按研究对象"));
    const count = data.papers.filter((p) => p.topics.includes(topic)).length;
    secondary.append(
      filterButton(
        "全部子类",
        count,
        !subtopic,
        () => selectView(topic),
        "subtopic",
      ),
    );
    const groups = [...new Set(children.map(([, child]) => child.group || ""))];
    for (const group of groups) {
      const groupRow = node("div", "subtopic-group");
      if (group) groupRow.append(node("span", "filter-label", group));
      for (const [id, child] of children.filter(
        ([, child]) => (child.group || "") === group,
      )) {
        const count = data.papers.filter((p) =>
          p.subtopics.includes(id),
        ).length;
        groupRow.append(
          filterButton(
            child.label,
            count,
            subtopic === id,
            () => selectView(topic, id),
            "subtopic",
          ),
        );
      }
      secondary.append(groupRow);
    }
  }
  const parentGuide = data.config.topic_guides?.[topic];
  const category = data.config.subtopics[subtopic];
  const guide = collection
    ? data.config.collections[collection]
    : category
      ? {
          summary: category.definition,
          points: [],
          reading_order: (parentGuide?.reading_order || []).filter((item) =>
            data.papers
              .find((p) => p.id === item.id)
              ?.subtopics.includes(subtopic),
          ),
        }
      : parentGuide;
  const panel = $("topic-guide");
  panel.replaceChildren();
  panel.hidden = !guide;
  if (guide) {
    panel.append(
      node(
        "p",
        "eyebrow",
        category
          ? "分类边界 · " + category.label
          : collection
            ? "交叉导读 · 知识库分析"
            : "主题导读 · 知识库分析",
      ),
    );
    panel.append(node("p", "guide-summary", guide.summary));
    const points = node("ul", "guide-points");
    for (const point of guide.points) points.append(node("li", "", point));
    if (guide.points.length) panel.append(points);
    if (guide.reading_order.length) {
      const reading = node("div", "guide-reading");
      reading.append(node("span", "", "建议阅读"));
      for (const [i, item] of guide.reading_order.entries()) {
        if (i) reading.append(node("span", "guide-arrow", "→"));
        reading.append(
          link(item.label, "#paper/" + encodeURIComponent(item.id)),
        );
      }
      panel.append(reading);
    }
  }
}
function renderList() {
  const terms = $("search")
    .value.trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const type = $("type-filter").value;
  const filtered = data.papers.filter(
    (p) =>
      (!topic || p.topics.includes(topic)) &&
      (!subtopic || p.subtopics.includes(subtopic)) &&
      (!collection || p.collections.includes(collection)) &&
      (!type || p.paper_type === type) &&
      terms.every((t) => p.searchText.includes(t)),
  );
  const mode = $("sort").value;
  filtered.sort((a, b) =>
    mode === "year"
      ? b.year - a.year || a.title.localeCompare(b.title)
      : mode === "title"
        ? a.title.localeCompare(b.title)
        : b.added_at.localeCompare(a.added_at) || a.id.localeCompare(b.id),
  );
  $("papers").replaceChildren();
  $("total").textContent = filtered.length + " / " + data.papers.length + " 篇";
  $("active-label").textContent =
    data.config.collections[collection]?.label ||
    data.config.subtopics[subtopic]?.label ||
    data.config.topics[topic] ||
    "全部论文";
  $("feedback").textContent = filtered.length
    ? ""
    : data.papers.length
      ? topic && !data.papers.some((p) => p.topics.includes(topic))
        ? "这个 Topic 还没有论文。在 Codex 中提供论文并要求收录即可。"
        : subtopic && !data.papers.some((p) => p.subtopics.includes(subtopic))
        ? "该子类尚未收录论文。0 篇表示当前馆藏，不代表该方向没有研究。"
        : "没有找到匹配的论文。试试其他关键词或分类。"
      : "知识库已就绪。在 Codex 中提交第一篇论文即可开始。";
  for (const [i, p] of filtered.entries()) {
    const row = link("", "#paper/" + encodeURIComponent(p.id), "paper-row");
    row.style.animationDelay = Math.min(i * 35, 210) + "ms";
    const meta = node("div", "paper-meta");
    meta.append(
      node("span", "type", typeLabels[p.paper_type]),
      node("span", "", "·"),
      node("span", "", String(p.year)),
      node("span", "", "·"),
      node("span", "", p.evidence.length + " 处原文证据"),
    );
    if (p.origin === "example")
      meta.append(node("span", "example-label", "初始化示例"));
    const bottom = node("div", "paper-bottom");
    const tags = node("div", "paper-tags");
    for (const t of p.topics)
      tags.append(node("span", "", data.config.topics[t]));
    for (const s of p.subtopics)
      tags.append(node("span", "", data.config.subtopics[s].label));
    const time = node("time", "", p.added_at + " 收录");
    time.dateTime = p.added_at;
    bottom.append(tags, time);
    row.append(
      meta,
      node("h3", "", p.title),
      node("p", "", p.one_liner),
      bottom,
      node("span", "row-arrow", "↗"),
    );
    row.addEventListener("click", () => {
      savedScroll = window.scrollY;
    });
    $("papers").append(row);
  }
  updateQuery();
}
function showRoute() {
  document.body.classList.toggle(
    "reading",
    location.hash.startsWith("#paper/"),
  );
  if (!location.hash.startsWith("#paper/")) {
    $("reader").hidden = true;
    $("library").hidden = false;
    document.title =
      "Paper Atlas · " +
      (data.config.topics[topic] || data.config.research_topic);
    return;
  }
  let id;
  try {
    id = decodeURIComponent(location.hash.slice(7).split("/")[0]);
  } catch {
    id = "";
  }
  const paper = data.papers.find((p) => p.id === id);
  $("library").hidden = true;
  const reader = $("reader");
  reader.hidden = false;
  reader.replaceChildren();
  const back = node("button", "back", "← 返回论文列表");
  back.type = "button";
  back.onclick = () => {
    history.pushState(null, "", location.pathname + location.search);
    showRoute();
    window.scrollTo(0, savedScroll);
  };
  reader.append(back);
  if (!paper) {
    reader.append(
      node("h2", "", "没有找到这篇论文"),
      node("p", "", "链接可能已变更，请返回列表查找。"),
    );
    return;
  }
  document.title = paper.title + " · Paper Atlas";
  const head = node("header", "reader-header");
  head.append(
    node("p", "eyebrow", typeLabels[paper.paper_type] + " / " + paper.year),
    node("h2", "", paper.title),
    node("p", "lead", paper.one_liner),
    node("p", "author", paper.authors.join(" · ")),
  );
  if (paper.origin === "example")
    head.append(
      node(
        "p",
        "example-label",
        "初始化示例 · 用于展示收录规范，不代表用户已读。",
      ),
    );
  const actions = node("div", "reader-actions");
  const source =
    paper.source.url ||
    data.config.repository_url + "/blob/main/" + paper.source.attachment;
  actions.append(
    link("阅读原文 ↗", source, "", true),
    link(
      "查看卡片与版本 ↗",
      data.config.repository_url + "/blob/main/cards/" + paper.id + ".md",
      "",
      true,
    ),
  );
  head.append(actions);
  reader.append(head);
  if (paper.classification_reason) {
    const classification = node("aside", "paper-classification");
    classification.setAttribute("aria-label", "论文归类依据");
    classification.append(node("p", "eyebrow", "知识库归类"));
    const paths = node("div", "classification-paths");
    for (const t of paper.topics) {
      const path = node("span");
      path.append(
        link(data.config.topics[t], "?topic=" + encodeURIComponent(t)),
      );
      for (const s of paper.subtopics.filter(
        (s) => data.config.subtopics[s].topic === t,
      )) {
        path.append(
          node("span", "", " › "),
          link(
            data.config.subtopics[s].label,
            "?topic=" +
              encodeURIComponent(t) +
              "&subtopic=" +
              encodeURIComponent(s),
          ),
        );
      }
      paths.append(path);
    }
    for (const c of paper.collections)
      paths.append(
        link(
          "交叉入口 · " + data.config.collections[c].label,
          "?collection=" + encodeURIComponent(c),
        ),
      );
    classification.append(
      paths,
      node("p", "classification-reason", paper.classification_reason),
    );
    reader.append(classification);
  }
  const toc = node("nav", "toc");
  toc.setAttribute("aria-label", "卡片目录");
  for (const [key, title] of Object.entries(data.sections)) {
    const a = node("a", "", title);
    a.href = "#paper/" + id + "/" + key;
    toc.append(a);
  }
  reader.append(toc);
  for (const [key, title] of Object.entries(data.sections)) {
    const section = node("section", "reader-section");
    section.id = key;
    const heading = node("h3", "", title);
    if (key === "relevance")
      heading.append(node("span", "analysis-label", "知识库分析"));
    section.append(heading, node("p", "", paper.sections[key].text));
    const citations = node("div", "citations");
    for (const eid of paper.sections[key].evidence) {
      const e = paper.evidence.find((x) => x.id === eid);
      const a = node(
        "a",
        "",
        "[" +
          eid +
          " · " +
          (paper.source.format === "pdf" ? "p." + e.page : e.locator) +
          "]",
      );
      a.href = "#paper/" + id + "/" + eid;
      citations.append(a);
    }
    section.append(citations);
    reader.append(section);
  }
  const evidence = node("section", "reader-section");
  evidence.append(node("h3", "", "原文证据"));
  for (const e of paper.evidence) {
    const item = node("div", "evidence");
    item.id = e.id;
    item.append(
      node(
        "small",
        "",
        e.id +
          " · " +
          e.locator +
          (paper.source.format === "pdf"
            ? " · 来源页 " + e.page
            : " · 网页全文"),
      ),
      node("blockquote", "", e.quote),
    );
    evidence.append(item);
  }
  reader.append(evidence);
  const related = node("section", "reader-section");
  related.append(node("h3", "", "相关论文"));
  const relations = [...paper.related];
  for (const p of data.papers)
    for (const r of p.related)
      if (r.id === id && !relations.some((x) => x.id === p.id))
        relations.push({ id: p.id, reason: r.reason });
  for (const r of relations) {
    const other = data.papers.find((p) => p.id === r.id);
    const a = link(other.title + " ↗", "#paper/" + other.id, "related-link");
    a.append(node("small", "", r.reason));
    related.append(a);
  }
  if (!relations.length)
    related.append(node("p", "", "暂无明确关联的已收录论文。"));
  reader.append(
    related,
    node(
      "p",
      "reader-end",
      "收录 " +
        paper.added_at +
        " · 更新 " +
        paper.updated_at +
        " · Codex 全文整理与证据复核 · 提示词 v" +
        paper.review.prompt_version,
    ),
  );
  const part = location.hash.split("/")[2];
  if (part)
    requestAnimationFrame(() => {
      const target = document.getElementById(part);
      target?.classList.add("is-highlighted");
      target?.scrollIntoView({ block: "start" });
    });
  else window.scrollTo(0, 0);
}
async function init() {
  try {
    const response = await fetch("data.json", { cache: "no-cache" });
    if (!response.ok) throw new Error("HTTP " + response.status);
    data = await response.json();
    readView(params);
    for (const p of data.papers)
      p.searchText = JSON.stringify([
        p.title,
        p.authors,
        p.tags,
        p.one_liner,
        p.sections,
        p.classification_reason,
        p.topics.map((t) => data.config.topics[t]),
        p.subtopics.map((s) => data.config.subtopics[s].label),
        p.collections.map((c) => data.config.collections[c].label),
      ]).toLocaleLowerCase();
    for (const [type, label] of Object.entries(typeLabels)) {
      const option = node("option", "", label);
      option.value = type;
      $("type-filter").append(option);
    }
    $("search").value = params.get("q") || "";
    $("type-filter").value = params.get("type") || "";
    $("sort").value = ["added", "year", "title"].includes(params.get("sort"))
      ? params.get("sort")
      : "added";
    $("repo-link").href = data.config.repository_url;
    $("readme-link").href = data.config.repository_url + "/blob/main/README.md";
    $("search-form").onsubmit = (event) => event.preventDefault();
    $("search").oninput = renderList;
    $("type-filter").onchange = renderList;
    $("sort").onchange = renderList;
    $("close-help").onclick = () => $("help").close();
    $("header-help").onclick = () => $("help").showModal();
    $("help").onclick = (event) => {
      if (event.target === $("help")) {
        const rect = $("help").getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          $("help").close();
      }
    };
    document.addEventListener("keydown", (event) => {
      if (
        event.key === "/" &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(
          document.activeElement.tagName,
        ) &&
        !$("help").open
      ) {
        event.preventDefault();
        if (location.hash) {
          history.pushState(null, "", location.pathname + location.search);
          showRoute();
        }
        $("search").focus();
      }
    });
    window.addEventListener("hashchange", showRoute);
    window.addEventListener("popstate", () => {
      const state = new URLSearchParams(location.search);
      $("search").value = state.get("q") || "";
      readView(state);
      $("type-filter").value = state.get("type") || "";
      $("sort").value = ["added", "year", "title"].includes(state.get("sort"))
        ? state.get("sort")
        : "added";
      renderTopics();
      renderList();
      showRoute();
    });
    if (data.pending_count)
      $("footer").textContent +=
        " 另有 " + data.pending_count + " 篇待处理，详见仓库 inbox。";
    renderTopics();
    renderList();
    showRoute();
  } catch (error) {
    $("feedback").textContent =
      "知识库暂时无法加载。请刷新重试，或在 GitHub 查看卡片。";
    console.error(error);
  }
}
init();
