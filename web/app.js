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
function updateQuery() {
  const query = new URLSearchParams();
  if ($("search").value) query.set("q", $("search").value);
  if (topic) query.set("topic", topic);
  if ($("type-filter").value) query.set("type", $("type-filter").value);
  if ($("sort").value !== "added") query.set("sort", $("sort").value);
  history.replaceState(
    null,
    "",
    location.pathname + (query.size ? "?" + query : "") + location.hash,
  );
}
function renderTopics() {
  const all = { "": "全部论文", ...data.config.topics };
  $("topics").replaceChildren();
  for (const [id, label] of Object.entries(all)) {
    const count = data.papers.filter(
      (p) => !id || p.topics.includes(id),
    ).length;
    if (id && count === 0) continue;
    const btn = node("button", "topic" + (topic === id ? " active" : ""));
    btn.type = "button";
    btn.setAttribute("aria-pressed", String(topic === id));
    btn.append(node("b", "", label), node("span", "", String(count)));
    btn.addEventListener("click", () => {
      topic = id;
      if (location.hash)
        history.pushState(null, "", location.pathname + location.search);
      renderTopics();
      renderList();
      showRoute();
    });
    $("topics").append(btn);
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
  $("active-label").textContent = data.config.topics[topic] || "全部论文";
  $("feedback").textContent = filtered.length
    ? ""
    : data.papers.length
      ? "没有找到匹配的论文。试试其他关键词或分类。"
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
    document.title = "Paper Atlas · 已读论文库";
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
    $("research-topic").textContent = data.config.research_topic;
    $("description").textContent = data.config.description;
    for (const p of data.papers)
      p.searchText = JSON.stringify([
        p.title,
        p.authors,
        p.tags,
        p.one_liner,
        p.sections,
        p.topics.map((t) => data.config.topics[t]),
      ]).toLocaleLowerCase();
    if (!(topic in data.config.topics)) topic = "";
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
      topic =
        state.get("topic") in data.config.topics ? state.get("topic") : "";
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
