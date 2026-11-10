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
let subtopic = "";
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
  if (subtopic) query.set("subtopic", subtopic);
  if (collection) query.set("collection", collection);
  if (guideOpen) query.set("view", "guide");
  else if (topic && !collection) query.set("view", "works");
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
    topic = data.config.subtopics[ids.at(-1)].topic;
  // Old shared URLs may contain multiple choices; retain only the last valid category.
  subtopic =
    ids.filter((id) => data.config.subtopics[id].topic === topic).at(-1) || "";
  const researchTopic = Object.values(data.config.axes).some(
    (axis) => axis.topic === topic,
  );
  guideOpen =
    researchTopic &&
    !collection &&
    !subtopic &&
    !state.get("q") &&
    !state.get("type") &&
    (state.get("view") === "guide" ||
      (!state.has("view") && !state.has("sort")));
  if (subtopic) expandedAxes.add(data.config.subtopics[subtopic].axis);
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
  subtopic = nextSubtopic;
  collection = nextCollection;
  if (collection) topic = data.config.collections[collection].topic || "";
  guideOpen =
    !collection &&
    !nextSubtopic &&
    Object.values(data.config.axes).some((axis) => axis.topic === topic);
  $("search").value = "";
  $("type-filter").value = "";
  if (guideOpen) $("sort").value = "added";
  if (nextSubtopic) expandedAxes.add(data.config.subtopics[nextSubtopic].axis);
  closeSidebar();
  refreshView();
  window.scrollTo(0, 0);
}
function navButton(label, count, active, action, className = "topic") {
  const btn = node("button", className + (active ? " active" : ""));
  btn.type = "button";
  if (active) btn.setAttribute("aria-current", "page");
  btn.append(node("span", "nav-label", label));
  if (count !== null) btn.append(node("span", "nav-count", String(count)));
  btn.addEventListener("click", action);
  return btn;
}
function matchesCategory(paper, category = subtopic) {
  return !category || paper.subtopics.includes(category);
}
function renderTopics() {
  const nav = $("topics");
  nav.replaceChildren();
  nav.append(
    navButton("全部论文", data.papers.length, !topic && !collection, () =>
      selectView(),
    ),
  );
  nav.append(node("p", "nav-section-label", "研究主题"));
  for (const [id, label] of Object.entries(data.config.topics)) {
    if (id === "interest-exploration") continue;
    const count = data.papers.filter((p) => p.topics.includes(id)).length;
    const branch = node("div", "topic-branch");
    branch.append(
      navButton(label, count, topic === id && !collection, () =>
        selectView(id),
      ),
    );
    if (id === topic && !collection) {
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
              p.subtopics.includes(sid),
          ).length;
          group.append(
            navButton(
              child.label,
              count,
              subtopic === sid,
              () => selectView(id, sid),
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
      navButton(
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
    navButton(
      data.config.topics[interest],
      data.papers.filter((p) => p.topics.includes(interest)).length,
      topic === interest,
      () => selectView(interest),
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
  if (subtopic)
    crumbs.append(
      node("span", "", "›"),
      node("span", "", data.config.subtopics[subtopic].label),
    );
}
function renderGuide() {
  const panel = $("topic-guide");
  panel.replaceChildren();
  panel.hidden = !guideOpen && !collection;
  const guide = collection
    ? data.config.collections[collection]
    : data.config.topic_guides[topic];
  if (!guide || panel.hidden) return;
  const details = node(collection ? "details" : "section", "guide-details");
  if (collection) {
    details.append(node("summary", "", "专题介绍"));
    details.append(node("p", "guide-summary", guide.summary));
  } else {
    const jump = node("div", "topic-paper-entry");
    const count = data.papers.filter((p) => p.topics.includes(topic)).length;
    jump.append(
      node("span", "", "问题导航"),
      link("查看本主题 " + count + " 篇论文 ↓", "#list-controls"),
    );
    details.append(jump);
  }
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
          subtopic = "";
          $("search").value = "";
          $("type-filter").value = "";
          $("sort").value = question.view === "year" ? "year" : "added";
          refreshView();
          window.scrollTo(0, 0);
        }
      };
      cell.append(action);
      row.append(node("td", "", question.question), cell);
      body.append(row);
    }
    table.append(body);
    details.append(table);
  }
  const notes = collection ? details : node("details", "guide-notes");
  if (!collection) {
    notes.append(node("summary", "", "主题说明与阅读建议"));
    notes.append(node("p", "guide-summary", guide.summary));
    details.append(notes);
  }
  const points = node("ul", "guide-points");
  for (const point of guide.points) points.append(node("li", "", point));
  notes.append(points);
  if (guide.reading_order.length) {
    const reading = node("div", "guide-reading");
    reading.append(node("span", "", "建议阅读"));
    for (const item of guide.reading_order)
      reading.append(link(item.label, "#paper/" + item.id));
    notes.append(reading);
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
      matchesCategory(p) &&
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
    : topic === "interest-exploration" &&
        !data.papers.some((p) => p.topics.includes(topic))
      ? "这里还没有论文。在 Codex 中提供方向之外感兴趣的文章，并要求收录即可。"
      : "这个分类下暂无匹配论文。可以查看其他分类或修改关键词。";
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
    );
    if (p.origin === "example")
      meta.append(node("span", "example-label", "示例论文"));
    const bottom = node("div", "paper-bottom");
    const tags = node("div", "paper-tags");
    for (const t of p.topics)
      tags.append(node("span", "", data.config.topics[t]));
    const previewTags = [];
    const seenAxes = new Set();
    for (const s of [
      ...[subtopic].filter((id) => id && p.subtopics.includes(id)),
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
    head.append(node("p", "example-label", "示例论文"));
  const actions = node("div", "reader-actions");
  const source =
    paper.source.url ||
    data.config.repository_url + "/blob/main/" + paper.source.attachment;
  actions.append(link("阅读原文 ↗", source, "", true));
  head.append(actions);
  reader.append(head);
  const visibleSections = Object.entries(data.sections).filter(
    ([key]) => key !== "relevance",
  );
  const toc = node("nav", "toc");
  toc.setAttribute("aria-label", "卡片目录");
  for (const [key, title] of visibleSections) {
    const a = node("a", "", title);
    a.href = "#paper/" + id + "/" + key;
    toc.append(a);
  }
  reader.append(toc);
  for (const [key, title] of visibleSections) {
    const section = node("section", "reader-section");
    section.id = key;
    const heading = node("h3", "", title);
    section.append(heading, node("p", "", paper.sections[key].text));
    reader.append(section);
  }
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
      "收录 " + paper.added_at + " · 更新 " + paper.updated_at,
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
        Object.fromEntries(
          Object.entries(p.sections)
            .filter(([key]) => key !== "relevance")
            .map(([key, value]) => [key, value.text]),
        ),
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
    $("search").oninput = () => {
      if (guideOpen) {
        guideOpen = false;
        renderTopics();
      }
      renderList();
    };
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
