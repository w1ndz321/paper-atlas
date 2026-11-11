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
let originalData;
const params = new URLSearchParams(location.search);
let topic = "";
let subtopic = "";
let collection = "";
let guideOpen = false;
let savedScroll = 0;
const expandedAxes = new Set();
const expandedTopics = new Set();
let sidebarCloseTimer;
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
    el.setAttribute("aria-label", text + " · " + t("在新标签页打开"));
    el.title = t("在新标签页打开");
  }
  return el;
}
function updateQuery(push = false, hash = location.hash) {
  const query = new URLSearchParams();
  if (language === "en") query.set("lang", "en");
  if ($("search").value) query.set("q", $("search").value);
  if (topic) query.set("topic", topic);
  if (subtopic) query.set("subtopic", subtopic);
  if (collection) query.set("collection", collection);
  if (guideOpen) query.set("view", "guide");
  else if (topic && !collection) query.set("view", "works");
  if ($("type-filter").value) query.set("type", $("type-filter").value);
  if ($("read-status").value) query.set("status", $("read-status").value);
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
    !state.get("status") &&
    (state.get("view") === "guide" ||
      (!state.has("view") && !state.has("sort")));
  if (subtopic) {
    expandedTopics.add(topic);
    expandedAxes.add(data.config.subtopics[subtopic].axis);
  }
}
function setSidebarOpen(open) {
  clearTimeout(sidebarCloseTimer);
  $("sidebar").classList.toggle("is-open", open);
  $("sidebar-content").inert = !open;
  $("sidebar-peek").setAttribute("aria-expanded", String(open));
}
function closeSidebar() {
  setSidebarOpen(false);
}
function setupSidebar() {
  const sidebar = $("sidebar");
  const desktop = window.matchMedia("(min-width: 761px)");
  $("sidebar-peek").onclick = (event) => {
    // Mouse entry already opens the rail; clicking it should keep it open.
    const mouseClick = desktop.matches && event.pointerType === "mouse";
    setSidebarOpen(mouseClick || !sidebar.classList.contains("is-open"));
  };
  sidebar.addEventListener("pointerenter", (event) => {
    if (desktop.matches && event.pointerType === "mouse") setSidebarOpen(true);
  });
  sidebar.addEventListener("pointerleave", (event) => {
    if (desktop.matches && event.pointerType === "mouse")
      sidebarCloseTimer = setTimeout(() => setSidebarOpen(false), 240);
  });
  sidebar.addEventListener("focusin", () => {
    // Keep keyboard navigation visible while moving between directory entries.
    clearTimeout(sidebarCloseTimer);
  });
  sidebar.addEventListener("focusout", (event) => {
    if (!sidebar.contains(event.relatedTarget) && !sidebar.matches(":hover"))
      setSidebarOpen(false);
  });
  document.addEventListener("pointerdown", (event) => {
    if (!sidebar.contains(event.target)) setSidebarOpen(false);
  });
  desktop.addEventListener("change", closeSidebar);
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
  $("read-status").value = "";
  if (guideOpen) $("sort").value = "added";
  if (nextSubtopic) expandedAxes.add(data.config.subtopics[nextSubtopic].axis);
  if (nextTopic && !nextCollection) expandedTopics.add(nextTopic);
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
function addPendingCategories(entries, config, currentLanguage) {
  for (const [axisId, axis] of Object.entries(config.axes)) {
    const missing = entries.filter((paper) => paper.topics.includes(axis.topic) &&
      !paper.subtopics.some((id) => config.subtopics[id]?.axis === axisId));
    if (!missing.length) continue;
    const id = "pending-" + axisId;
    config.subtopics[id] = {
      topic: axis.topic, axis: axisId, pending: true,
      label: currentLanguage === "en" ? "Awaiting classification" : "待核对分类",
    };
    for (const paper of missing) paper.subtopics.push(id);
  }
}
function renderTopics() {
  const nav = $("topics");
  nav.replaceChildren();
  nav.append(
    navButton(t("全部论文"), data.entries.length, !topic && !collection, () =>
      selectView(),
    ),
  );
  nav.append(node("p", "nav-section-label", t("研究主题")));
  for (const [id, label] of Object.entries(data.config.topics)) {
    if (id === "interest-exploration") continue;
    const count = data.entries.filter((p) => p.topics.includes(id)).length;
    const branch = node("div", "topic-branch");
    branch.dataset.topic = id;
    const heading = node("div", "topic-heading");
    const disclosure = node("button", "topic-disclosure", expandedTopics.has(id) ? "⌄" : "›");
    disclosure.type = "button";
    disclosure.setAttribute("aria-label", (expandedTopics.has(id) ? t("收起分类") : t("展开分类")) + " · " + label);
    disclosure.setAttribute("aria-expanded", String(expandedTopics.has(id)));
    disclosure.setAttribute("aria-controls", "categories-" + id);
    disclosure.onclick = () => {
      if (expandedTopics.has(id)) expandedTopics.delete(id);
      else expandedTopics.add(id);
      renderTopics();
      $("topics").querySelector(`[aria-controls="categories-${id}"]`)?.focus();
    };
    heading.append(disclosure, navButton(label, count, topic === id && !collection, () => selectView(id)));
    branch.append(heading);
    const children = node("div", "topic-children");
    children.id = "categories-" + id;
    children.hidden = !expandedTopics.has(id);
    if (expandedTopics.has(id)) {
      const axes = Object.entries(data.config.axes).filter(
        ([, axis]) => axis.topic === id,
      );
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
          const count = data.entries.filter(
            (p) =>
              p.topics.includes(id) &&
              p.subtopics.includes(sid),
          ).length;
          if (!count) continue;
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
        if (group.childElementCount > 1) children.append(group);
      }
    }
    branch.append(children);
    nav.append(branch);
  }
  const collections = $("collections");
  collections.replaceChildren(node("p", "nav-section-label", t("专题")));
  for (const [id, entry] of Object.entries(data.config.collections)) {
    const count = data.entries.filter((p) => p.collections.includes(id)).length;
    if (!count) continue;
    collections.append(
      navButton(
        entry.label,
        count,
        collection === id,
        () => selectView(entry.topic || "", "", id),
        "collection",
      ),
    );
  }
  const interest = "interest-exploration";
  const interestCount = data.entries.filter((p) => p.topics.includes(interest)).length;
  if (interestCount) collections.append(
    navButton(
      data.config.topics[interest],
      interestCount,
      topic === interest,
      () => selectView(interest),
    ),
  );
  renderGuide();
  const crumbs = $("breadcrumb");
  crumbs.replaceChildren();
  const home = node("button", "", t("全部论文"));
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
    details.append(node("summary", "", t("专题介绍")));
    details.append(node("p", "guide-summary", guide.summary));
  } else {
    const jump = node("div", "topic-paper-entry");
    const count = data.entries.filter((p) => p.topics.includes(topic)).length;
    jump.append(
      node("span", "", t("问题导航")),
      link(language === "en" ? `View ${count} papers in this topic ↓` : `查看本主题 ${count} 篇论文 ↓`, "#list-controls"),
    );
    details.append(jump);
  }
  if (guide.questions?.length) {
    const table = node("table", "question-table");
    const head = node("thead");
    const hrow = node("tr");
    for (const label of [t("如果你想问的是……"), t("从这里开始")])
      hrow.append(node("th", "", label));
    head.append(hrow);
    table.append(head);
    const body = node("tbody");
    for (const question of guide.questions.slice(0, 3)) {
      const row = node("tr");
      const cell = node("td");
      const action = node("button", "question-entry", question.label + " →");
      action.onclick = () => {
        if (question.axis) {
          expandedTopics.add(topic);
          expandedAxes.add(question.axis);
          renderTopics();
          const target = $("topics").querySelector(
            `[data-axis="${question.axis}"] summary`,
          );
          setSidebarOpen(true);
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
    notes.append(node("summary", "", t("主题说明与阅读建议")));
    notes.append(node("p", "guide-summary", guide.summary));
    details.append(notes);
  }
  const points = node("ul", "guide-points");
  for (const point of guide.points) points.append(node("li", "", point));
  notes.append(points);
  if (guide.reading_order.length) {
    const reading = node("div", "guide-reading");
    reading.append(node("span", "", t("建议阅读")));
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
  const status = $("read-status").value;
  const scope = data.entries.filter(
    (p) => (!topic || collection || p.topics.includes(topic)) &&
      matchesCategory(p) && (!collection || p.collections.includes(collection)),
  );
  const filtered = scope.filter(
    (p) =>
      (!type || p.paper_type === type) &&
      (!status || p.entry_kind === status) &&
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
  $("total").textContent = filtered.length + " / " + scope.length + " " + t("篇");
  const cards = filtered.filter((p) => p.entry_kind === "card").length;
  const references = filtered.length - cards;
  $("reading-summary").textContent = language === "en"
    ? `${cards} full-text ${cards === 1 ? "card" : "cards"} · ${references} reading-list ${references === 1 ? "entry" : "entries"}. Unclassified entries appear under “Awaiting classification”.`
    : `${cards} 篇精读卡片 · ${references} 篇文献索引。尚未确定归类的文章列在“待核对分类”中。`;
  $("clear-search").hidden = !$("search").value;
  $("reset-filters").hidden = !terms.length && !type && !status && !subtopic;
  $("active-label").textContent =
    data.config.collections[collection]?.label ||
    data.config.subtopics[subtopic]?.label ||
    data.config.topics[topic] ||
    t("全部论文");
  $("feedback").textContent = filtered.length
    ? ""
    : topic === "interest-exploration" &&
        !data.papers.some((p) => p.topics.includes(topic))
      ? t("这里还没有论文。在 Codex 中提供方向之外感兴趣的文章，并要求收录即可。")
      : t("这个分类下暂无匹配论文。可以查看其他分类或修改关键词。");
  for (const [i, p] of filtered.entries()) {
    const row = link("", "#paper/" + encodeURIComponent(p.id), "paper-row");
    row.style.animationDelay = Math.min(i * 35, 210) + "ms";
    const meta = node("div", "paper-meta");
    meta.append(
      node("span", "reading-status", t(p.entry_kind === "reference" ? "文献索引 · 待精读" : "精读卡片")),
      node("span", "type", t(typeLabels[p.paper_type])),
      node("span", "", "·"),
      node("span", "", String(p.year)),
    );
    if (p.entry_kind === "card" && language === "en" && !p.translations?.en)
      meta.append(node("span", "example-label", t("英文翻译待补充")));
    if (p.origin === "example")
      meta.append(node("span", "example-label", t("示例论文")));
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
      if (category.pending) continue;
      if (!seenAxes.has(category.axis)) {
        seenAxes.add(category.axis);
        previewTags.push(s);
      }
    }
    for (const s of previewTags.slice(0, 3))
      tags.append(node("span", "", data.config.subtopics[s].label));
    const time = node("time", "", p.added_at + " " + t("收录"));
    time.dateTime = p.added_at;
    bottom.append(tags, time);
    const cta = node("span", "card-cta", t(p.entry_kind === "reference" ? "查看文献" : "阅读卡片") + " →");
    row.append(
      meta,
      node("h3", "", p.title),
      node("p", "", p.one_liner),
      bottom,
      cta,
    );
    row.addEventListener("click", () => {
      savedScroll = window.scrollY;
    });
    $("papers").append(row);
  }
  updateQuery();
}
function sourceLocation(paper, evidence) {
  const url = new URL(
    paper.source.url ||
      data.config.repository_url + "/raw/refs/heads/main/" + paper.source.attachment,
  );
  if (paper.source.format === "pdf") {
    if (url.hostname === "arxiv.org")
      url.pathname = url.pathname.replace(/^\/abs\//, "/pdf/");
    url.hash = "page=" + evidence.page;
    return {label: language === "en" ? `Original, p. ${evidence.page} · ${evidence.locator}` : `原文第 ${evidence.page} 页 · ${evidence.locator}`, href: url.href};
  }
  url.hash = ":~:text=" + encodeURIComponent(evidence.quote);
  return {label: (language === "en" ? "Original · " : "原文 · ") + evidence.locator, href: url.href};
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
  const paper = data.entries.find((p) => p.id === id);
  $("library").hidden = true;
  const reader = $("reader");
  reader.hidden = false;
  reader.replaceChildren();
  const back = node("button", "back", t("← 返回论文列表"));
  back.type = "button";
  back.onclick = () => {
    history.pushState(null, "", location.pathname + location.search);
    showRoute();
    window.scrollTo(0, savedScroll);
  };
  reader.append(back);
  if (!paper) {
    reader.append(
      node("h2", "", t("没有找到这篇论文")),
      node("p", "", t("链接可能已变更，请返回列表查找。")),
    );
    return;
  }
  document.title = paper.title + " · Paper Atlas";
  const head = node("header", "reader-header");
  head.append(
    node("p", "eyebrow", t(typeLabels[paper.paper_type]) + " / " + paper.year),
    node("h2", "", paper.title),
    node("p", "lead", paper.one_liner),
    node("p", "author", paper.authors.join(" · ")),
  );
  if (paper.entry_kind === "card" && language === "en" && !paper.translations?.en)
    head.append(node("p", "example-label", t("英文翻译待补充")));
  if (paper.origin === "example")
    head.append(node("p", "example-label", t("示例论文")));
  const actions = node("div", "reader-actions");
  const source =
    paper.source.url ||
    data.config.repository_url + "/blob/main/" + paper.source.attachment;
  actions.append(link(t("阅读原文 ↗"), source, "", true));
  head.append(actions);
  reader.append(head);
  if (paper.entry_kind === "reference") {
    head.prepend(node("p", "reading-status", t("文献索引 · 待精读")));
    const note = node("section", "reference-note");
    note.append(node("h3", "", t("为什么放在这里")), node("p", "", paper.context));
    note.append(node("p", "reference-boundary", t("这是根据官方论文页整理的阅读线索，尚未完成全文精读。方法细节、实验结果与适用边界请以原文为准。")));
    note.append(node("p", "author", t("来源核对") + " · " + paper.verified_at));
    reader.append(note);
    window.scrollTo(0, 0);
    return;
  }
  const visibleSections = Object.entries(data.sections).filter(
    ([key]) => key !== "relevance",
  );
  const layout = node("div", "reader-layout");
  const body = node("div", "reader-body");
  const toc = node("details", "toc");
  toc.open = window.matchMedia("(min-width: 1100px)").matches;
  toc.append(node("summary", "", t("文章大纲")));
  const outline = node("nav", "toc-links");
  outline.setAttribute("aria-label", t("文章大纲"));
  for (const [key, title] of visibleSections) {
    const a = node("a", "", title);
    a.href = "#paper/" + id + "/" + key;
    if (location.hash.split("/")[2] === key) a.setAttribute("aria-current", "location");
    outline.append(a);
  }
  toc.append(outline);
  layout.append(toc, body);
  reader.append(layout);
  for (const [key, title] of visibleSections) {
    const section = node("section", "reader-section");
    section.id = key;
    const heading = node("h3", "", title);
    section.append(heading, node("p", "", paper.sections[key].text));
    const locations = node("div", "source-locations");
    const seen = new Set();
    for (const evidenceId of paper.sections[key].evidence) {
      const evidence = paper.evidence.find((item) => item.id === evidenceId);
      const locationKey = evidence.page + "/" + evidence.locator;
      if (seen.has(locationKey)) continue;
      seen.add(locationKey);
      const location = sourceLocation(paper, evidence);
      locations.append(link(location.label + " ↗", location.href, "", true));
    }
    if (locations.childElementCount) section.append(locations);
    body.append(section);
  }
  const related = node("section", "reader-section");
  related.append(node("h3", "", t("相关论文")));
  const relations = [...paper.related];
  for (const p of data.papers)
    for (const r of p.related)
      if (r.id === id && !relations.some((x) => x.id === p.id))
        relations.push({ id: p.id, reason: r.reason });
  for (const r of relations) {
    const other = data.papers.find((p) => p.id === r.id);
    const a = link(other.title + " →", "#paper/" + other.id, "related-link");
    a.append(node("small", "", r.reason));
    related.append(a);
  }
  if (!relations.length)
    related.append(node("p", "", t("暂无明确关联的已收录论文。")));
  body.append(
    related,
    node(
      "p",
      "reader-end",
      t("收录") + " " + paper.added_at + " · " + t("更新") + " " + paper.updated_at,
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
function applyLocale(nextLanguage) {
  language = nextLanguage;
  data = localizeData(originalData, language);
  document.documentElement.lang = language === "en" ? "en" : "zh-CN";
  for (const el of document.querySelectorAll("[data-i18n]"))
    el.textContent = t(el.dataset.i18n);
  for (const [attribute, datasetKey] of [["aria-label", "i18nAria"], ["placeholder", "i18nPlaceholder"]])
    for (const el of document.querySelectorAll(attribute === "aria-label" ? "[data-i18n-aria]" : "[data-i18n-placeholder]"))
      el.setAttribute(attribute, t(el.dataset[datasetKey]));
  const toggle = $("language-toggle");
  toggle.textContent = language === "zh" ? "EN" : "中文";
  toggle.lang = language === "zh" ? "en" : "zh-CN";
  toggle.setAttribute("aria-label", language === "zh" ? "Switch to English" : "切换为中文");
  const selectedType = $("type-filter").value;
  const allTypes = node("option", "", t("全部类型"));
  allTypes.value = "";
  $("type-filter").replaceChildren(allTypes);
  for (const [type, label] of Object.entries(typeLabels)) {
    const option = node("option", "", t(label));
    option.value = type;
    $("type-filter").append(option);
  }
  $("type-filter").value = selectedType;
  const englishLabels = originalData.config.translations?.en || {};
  for (const paper of data.papers) {
    paper.entry_kind = "card";
    const original = originalData.papers.find((item) => item.id === paper.id);
    const visibleText = (record) => Object.entries(record.sections)
      .filter(([key]) => key !== "relevance").map(([, section]) => section.text);
    const labels = [
      ...paper.topics.map((id) => originalData.config.topics[id]),
      ...paper.subtopics.map((id) => originalData.config.subtopics[id].label),
      ...paper.collections.map((id) => originalData.config.collections[id].label),
    ];
    paper.searchText = JSON.stringify([
      paper.title, paper.authors, paper.tags, paper.one_liner, visibleText(paper),
      original.one_liner, visibleText(original),
      paper.translations?.en?.one_liner,
      Object.entries(paper.translations?.en?.sections || {})
        .filter(([key]) => key !== "relevance").map(([, text]) => text),
      labels.map((label) => [label, englishLabels[label] || label]),
    ]).toLocaleLowerCase();
  }
  const manifest = data.reading_lists || { lists: {}, references: [] };
  const reviewedIds = new Set(data.papers.map((p) => p.id));
  const references = manifest.references.filter((p) => !reviewedIds.has(p.id)).map((ref) => {
    const memberships = Object.entries(manifest.lists).filter(([, ids]) => ids.includes(ref.id)).map(([id]) => id);
    const topics = memberships.filter((id) => Object.hasOwn(data.config.topics, id));
    const collections = memberships.filter((id) => Object.hasOwn(data.config.collections, id));
    return {
      ...ref, entry_kind: "reference", topics, collections, subtopics: [], tags: [],
      source: { url: ref.source_url }, added_at: ref.verified_at,
      one_liner: language === "en" ? ref.one_liner_en : ref.one_liner,
      context: language === "en" ? ref.context_en : ref.context,
      searchText: JSON.stringify([ref.title, ref.authors, ref.one_liner, ref.one_liner_en, ref.context, ref.context_en,
        topics.map((id) => [originalData.config.topics[id], data.config.topics[id]]),
        collections.map((id) => [originalData.config.collections[id].label, data.config.collections[id].label]),
      ]).toLocaleLowerCase(),
    };
  });
  data.entries = [...data.papers, ...references];
  addPendingCategories(data.entries, data.config, language);
  if (data.pending_count)
    $("footer").textContent += language === "en"
      ? ` ${data.pending_count} papers are pending. See inbox in the repository.`
      : ` 另有 ${data.pending_count} 篇待处理，详见仓库 inbox。`;
  try { window.localStorage.setItem("paper-atlas-language", language); } catch { /* Language switching also works without storage. */ }
}
function changeLanguage(nextLanguage) {
  const scroll = window.scrollY;
  const outlineOpen = $("reader").querySelector(".toc")?.open;
  applyLocale(nextLanguage);
  renderTopics();
  renderList();
  showRoute();
  const outline = $("reader").querySelector(".toc");
  if (outline && outlineOpen !== undefined) outline.open = outlineOpen;
  requestAnimationFrame(() => window.scrollTo(0, scroll));
}
async function init() {
  setupSidebar();
  try {
    const response = await fetch("data.json", { cache: "no-cache" });
    if (!response.ok) throw new Error("HTTP " + response.status);
    originalData = await response.json();
    let storage;
    try { storage = window.localStorage; } catch { /* Storage can be unavailable in private sessions. */ }
    applyLocale(preferredLanguage(location.search, storage));
    readView(params);
    $("search").value = params.get("q") || "";
    $("type-filter").value = params.get("type") || "";
    $("read-status").value = params.get("status") || "";
    $("sort").value = ["added", "year", "title"].includes(params.get("sort"))
      ? params.get("sort")
      : "added";
    $("language-toggle").onclick = () => changeLanguage(language === "zh" ? "en" : "zh");
    $("repo-link").href = data.config.repository_url;
    $("readme-link").href = data.config.repository_url + "/blob/main/README.md";
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && $("sidebar").classList.contains("is-open")) {
        closeSidebar();
        $("sidebar-peek").focus();
      }
    });
    window.matchMedia("(min-width: 1100px)").addEventListener("change", (event) => {
      const toc = $("reader").querySelector(".toc");
      if (toc) toc.open = event.matches;
    });
    $("search-form").onsubmit = (event) => event.preventDefault();
    $("clear-search").onclick = () => {
      $("search").value = "";
      renderList();
      $("search").focus();
    };
    $("reset-filters").onclick = () => {
      $("search").value = "";
      $("type-filter").value = "";
      $("read-status").value = "";
      subtopic = "";
      renderTopics();
      renderList();
      $("search").focus();
    };
    $("search").oninput = () => {
      if (guideOpen) {
        guideOpen = false;
        renderTopics();
      }
      renderList();
    };
    $("type-filter").onchange = renderList;
    $("read-status").onchange = renderList;
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
      applyLocale(state.get("lang") === "en" ? "en" : "zh");
      $("search").value = state.get("q") || "";
      readView(state);
      $("type-filter").value = state.get("type") || "";
      $("read-status").value = state.get("status") || "";
      $("sort").value = ["added", "year", "title"].includes(state.get("sort"))
        ? state.get("sort")
        : "added";
      renderTopics();
      renderList();
      showRoute();
    });
    renderTopics();
    renderList();
    showRoute();
  } catch (error) {
    $("feedback").textContent =
      t("知识库暂时无法加载。请刷新重试，或在 GitHub 查看卡片。");
    console.error(error);
  }
}
init();
