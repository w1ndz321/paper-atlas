/* Static reader: reviewed records, no remote runtime dependencies. */
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
let topic = "";
let subtopics = [];
let collection = "";
let guideOpen = false;
let savedScroll = 0;
const expandedAxes = new Set();
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
  for (const id of subtopics) query.append("subtopic", id);
  if (collection) query.set("collection", collection);
  if (guideOpen) query.set("view", "guide");
  if ($("type-filter").value) query.set("type", $("type-filter").value);
  if ($("sort").value !== "added") query.set("sort", $("sort").value);
  history[push ? "pushState" : "replaceState"](
    null,
    "",
    location.pathname + (query.size ? "?" + query : "") + hash,
  );
}
function readView(state) {
  const original = state.get("topic") || "";
  const requested = data.config.topic_aliases[original] || original;
  topic = Object.hasOwn(data.config.topics, requested) ? requested : "";
  collection =
    state.get("collection") ||
    (Object.hasOwn(data.config.collections, original) ? original : "");
  if (!Object.hasOwn(data.config.collections, collection)) collection = "";
  if (collection) topic = data.config.collections[collection].topic || "";
  const ids = state
    .getAll("subtopic")
    .map((id) =>
      Object.hasOwn(data.config.subtopic_aliases, id)
        ? data.config.subtopic_aliases[id]
        : id,
    )
    .filter((id) => Object.hasOwn(data.config.subtopics, id));
  if (ids.length && (!topic || original === "rsi-interpretability"))
    topic = data.config.subtopics[ids[0]].topic;
  subtopics = [
    ...new Set(ids.filter((id) => data.config.subtopics[id].topic === topic)),
  ];
  guideOpen =
    state.get("view") === "guide" &&
    Object.hasOwn(data.config.topic_guides, topic);
  for (const id of subtopics) expandedAxes.add(data.config.subtopics[id].axis);
}
function closeSidebar() {
  const wasOpen = $("sidebar").classList.contains("mobile-open");
  $("sidebar").classList.remove("mobile-open");
  $("sidebar-toggle").setAttribute("aria-expanded", "false");
  if (wasOpen) window.scrollTo(0, 0);
}
function refreshView(push = true) {
  updateQuery(push, "");
  renderTopics();
  renderList();
  showRoute();
}
function selectView(nextTopic = "", nextSubtopic = "", nextCollection = "") {
  topic = nextTopic;
  subtopics = nextSubtopic ? [nextSubtopic] : [];
  collection = nextCollection;
  guideOpen = false;
  if (collection) topic = data.config.collections[collection].topic || "";
  if (nextSubtopic) expandedAxes.add(data.config.subtopics[nextSubtopic].axis);
  closeSidebar();
  refreshView();
}
function filterButton(label, count, active, action, className = "topic") {
  const btn = node("button", className + (active ? " active" : ""));
  btn.type = "button";
  btn.setAttribute("aria-pressed", String(active));
  btn.append(node("span", "nav-label", label));
  if (count !== null) btn.append(node("span", "nav-count", String(count)));
  btn.addEventListener("click", action);
  return btn;
}
function matchesFacets(paper, selections = subtopics, excludingAxis = "") {
  const groups = new Map();
  for (const id of selections) {
    const axis = data.config.subtopics[id].axis;
    if (axis === excludingAxis) continue;
    if (!groups.has(axis)) groups.set(axis, []);
    groups.get(axis).push(id);
  }
  return [...groups.values()].every((ids) =>
    ids.some((id) => paper.subtopics.includes(id)),
  );
}
function toggleFacet(id) {
  subtopics = subtopics.includes(id)
    ? subtopics.filter((x) => x !== id)
    : [...subtopics, id];
  guideOpen = false;
  expandedAxes.add(data.config.subtopics[id].axis);
  closeSidebar();
  refreshView();
}
function renderTopics() {
  const nav = $("topics");
  nav.replaceChildren();
  nav.append(
    filterButton("全部论文", data.papers.length, !topic && !collection, () =>
      selectView(),
    ),
  );
  nav.append(node("p", "nav-section-label", "研究主题"));
  for (const [id, label] of Object.entries(data.config.topics)) {
    if (id === "interest-exploration") continue;
    const count = data.papers.filter((p) => p.topics.includes(id)).length;
    const branch = node("div", "topic-branch");
    branch.append(
      filterButton(label, count, topic === id && !collection, () =>
        selectView(id),
      ),
    );
    if (id === topic && !collection) {
      const guideButton = filterButton(
        "从问题开始 ↗",
        null,
        guideOpen,
        () => {
          guideOpen = !guideOpen;
          closeSidebar();
          refreshView();
        },
        "guide-entry",
      );
      branch.append(guideButton);
      const axes = Object.entries(data.config.axes).filter(
        ([, axis]) => axis.topic === id,
      );
      if (!axes.some(([key]) => expandedAxes.has(key)) && axes.length)
        expandedAxes.add(axes[0][0]);
      for (const [axisId, axis] of axes) {
        const group = node("details", "facet-group");
        group.dataset.axis = axisId;
        group.open = expandedAxes.has(axisId);
        const summary = node("summary", "", axis.label);
        const selectedCount = subtopics.filter(
          (s) => data.config.subtopics[s].axis === axisId,
        ).length;
        if (selectedCount)
          summary.append(
            node("span", "dimension-count", selectedCount + " 项"),
          );
        group.append(summary);
        group.addEventListener("toggle", () => {
          if (group.open) expandedAxes.add(axisId);
          else expandedAxes.delete(axisId);
        });
        for (const [sid, child] of Object.entries(data.config.subtopics).filter(
          ([, s]) => s.axis === axisId,
        )) {
          const count = data.papers.filter(
            (p) =>
              p.topics.includes(topic) &&
              (!collection || p.collections.includes(collection)) &&
              matchesFacets(p, subtopics, axisId) &&
              p.subtopics.includes(sid),
          ).length;
          group.append(
            filterButton(
              child.label,
              count,
              subtopics.includes(sid),
              () => toggleFacet(sid),
              "subtopic",
            ),
          );
        }
        branch.append(group);
      }
    }
    nav.append(branch);
  }
  const collections = $("collections");
  collections.replaceChildren(node("p", "nav-section-label", "专题"));
  for (const [id, entry] of Object.entries(data.config.collections)) {
    collections.append(
      filterButton(
        entry.label,
        data.papers.filter((p) => p.collections.includes(id)).length,
        collection === id,
        () => selectView(entry.topic || "", "", id),
        "collection",
      ),
    );
  }
  const interest = "interest-exploration";
  collections.append(
    filterButton(
      data.config.topics[interest],
      data.papers.filter((p) => p.topics.includes(interest)).length,
      topic === interest,
      () => selectView(interest),
    ),
  );
  if (topic === interest)
    collections.append(
      filterButton(
        "从问题开始 ↗",
        null,
        guideOpen,
        () => {
          guideOpen = !guideOpen;
          closeSidebar();
          refreshView();
        },
        "guide-entry",
      ),
    );
  renderGuide();
  const crumbs = $("breadcrumb");
  crumbs.replaceChildren();
  const home = node("button", "", "全部论文");
  home.onclick = () => selectView();
  crumbs.append(home);
  if (topic)
    crumbs.append(
      node("span", "", "›"),
      node("span", "", data.config.topics[topic]),
    );
  if (collection)
    crumbs.append(
      node("span", "", "›"),
      node("span", "", data.config.collections[collection].label),
    );
  if (guideOpen)
    crumbs.append(node("span", "", "›"), node("span", "", "从问题开始"));
  const filters = $("selected-filters");
  filters.replaceChildren();
  for (const id of subtopics) {
    const category = data.config.subtopics[id];
    const btn = node("button", "selected-filter", category.label + " ×");
    btn.setAttribute("aria-label", "移除筛选：" + category.label);
    btn.onclick = () => toggleFacet(id);
    filters.append(btn);
  }
  if (subtopics.length) {
    const clear = node("button", "clear-filters", "清除筛选");
    clear.onclick = () => {
      subtopics = [];
      refreshView();
    };
    filters.append(clear);
  }
  filters.hidden = !subtopics.length;
}
function renderGuide() {
  const panel = $("topic-guide");
  panel.replaceChildren();
  panel.hidden = !guideOpen && !collection;
  const guide = collection
    ? data.config.collections[collection]
    : data.config.topic_guides[topic];
  if (!guide || panel.hidden) return;
  const details = node("details", "guide-details");
  details.open = guideOpen;
  details.append(
    node(
      "summary",
      "",
      collection ? "专题导览与证据边界" : "带着问题，选择入口",
    ),
  );
  details.append(node("p", "guide-summary", guide.summary));
  if (guide.questions?.length) {
    const table = node("table", "question-table");
    const head = node("thead");
    const hrow = node("tr");
    for (const label of ["如果你想问的是……", "从这里开始"])
      hrow.append(node("th", "", label));
    head.append(hrow);
    table.append(head);
    const body = node("tbody");
    for (const question of guide.questions) {
      const row = node("tr");
      const cell = node("td");
      const action = node("button", "question-entry", question.label + " →");
      action.onclick = () => {
        if (question.axis) {
          expandedAxes.add(question.axis);
          renderTopics();
          const target = $("topics").querySelector(
            `[data-axis="${question.axis}"] summary`,
          );
          $("sidebar").classList.add("mobile-open");
          $("sidebar-toggle").setAttribute("aria-expanded", "true");
          target?.focus();
          target?.scrollIntoView({ block: "nearest" });
        } else {
          guideOpen = false;
          subtopics = [];
          $("search").value = "";
          $("type-filter").value = "";
          $("sort").value = question.view === "year" ? "year" : "added";
          refreshView();
        }
      };
      cell.append(action);
      row.append(node("td", "", question.question), cell);
      body.append(row);
    }
    table.append(body);
    details.append(table);
  }
  const points = node("ul", "guide-points");
  for (const point of guide.points) points.append(node("li", "", point));
  details.append(points);
  if (guide.reading_order.length) {
    const reading = node("div", "guide-reading");
    reading.append(node("span", "", "建议阅读"));
    for (const item of guide.reading_order)
      reading.append(link(item.label, "#paper/" + item.id));
    details.append(reading);
  }
  panel.append(details);
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
      matchesFacets(p) &&
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
    data.config.topics[topic] ||
    "全部论文";
  $("feedback").textContent = filtered.length
    ? ""
    : topic === "interest-exploration" &&
        !data.papers.some((p) => p.topics.includes(topic))
      ? "这里还没有论文。在 Codex 中提供方向之外感兴趣的文章，并要求收录即可。"
      : "没有匹配的论文。可以移除筛选或修改关键词；0 篇仅表示当前馆藏。";
  $("list-controls").hidden = guideOpen;
  $("papers").hidden = guideOpen;
  $("feedback").hidden = guideOpen;
  for (const [i, p] of filtered.entries()) {
    const row = link("", "#paper/" + encodeURIComponent(p.id), "paper-row");
    // Stable decorative tones keep a paper's appearance when filters change.
    const tone =
      [...p.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 4;
    row.dataset.tone = ["lavender", "cream", "aqua", "periwinkle"][tone];
    row.style.animationDelay = Math.min(i * 35, 210) + "ms";
    const meta = node("div", "paper-meta");
    meta.append(
      node("span", "type", typeLabels[p.paper_type]),
      node("span", "", "·"),
      node("span", "", String(p.year)),
      node("span", "", "·"),
      node("span", "", p.evidence.length + " 处原文证据"),
    );
    if (p.rsi_evidence)
      meta.append(node("span", "rsi-status", p.rsi_evidence.status));
    if (p.origin === "example")
      meta.append(node("span", "example-label", "初始化示例"));
    const bottom = node("div", "paper-bottom");
    const tags = node("div", "paper-tags");
    for (const t of p.topics)
      tags.append(node("span", "", data.config.topics[t]));
    const previewTags = [];
    const seenAxes = new Set();
    for (const s of [
      ...subtopics.filter((id) => p.subtopics.includes(id)),
      ...p.subtopics,
    ]) {
      const category = data.config.subtopics[s];
      if (!seenAxes.has(category.axis)) {
        seenAxes.add(category.axis);
        previewTags.push(s);
      }
    }
    for (const s of previewTags.slice(0, 3))
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
  if (paper.rsi_evidence) {
    const proof = node("section", "rsi-proof");
    proof.append(node("h3", "", "递归闭环与证据边界"));
    const list = node("dl");
    for (const [key, label] of [
      ["status", "证据状态"],
      ["next_round_role", "下一轮职责"],
      ["fixed_components", "固定组件"],
      ["capability_evidence", "改进能力证据"],
    ])
      list.append(
        node("dt", "", label),
        node("dd", "", paper.rsi_evidence[key]),
      );
    proof.append(list);
    reader.append(proof);
  }
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
          node(
            "span",
            "",
            " · " +
              data.config.axes[data.config.subtopics[s].axis].label +
              "：",
          ),
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
    $("sidebar-toggle").onclick = () => {
      const open = $("sidebar").classList.toggle("mobile-open");
      $("sidebar-toggle").setAttribute("aria-expanded", String(open));
    };
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeSidebar();
        $("sidebar-toggle").focus();
      }
    });
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
