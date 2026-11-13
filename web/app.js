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
const DESKTOP_MEDIA = "(min-width: 960px)";
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
  const researchTopic =
    Object.values(data.config.axes).some((axis) => axis.topic === topic) ||
    Object.values(data.config.subtopics).some((sub) => sub.topic === topic);
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
    const axis = data.config.subtopics[subtopic].axis;
    if (axis) expandedAxes.add(axis);
  }
}
function chevronSvg() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 20 20");
  svg.setAttribute("fill", "none");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M7.5 5.5 12.5 10l-5 4.5");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.7");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.append(path);
  return svg;
}
function isDesktop() {
  return window.matchMedia(DESKTOP_MEDIA).matches;
}
function isSidebarOpen() {
  return isDesktop()
    ? !document.body.classList.contains("sidebar-collapsed")
    : $("sidebar").classList.contains("is-open");
}
function setSidebarOpen(open) {
  const desktop = isDesktop();
  document.body.classList.toggle("sidebar-collapsed", desktop && !open);
  $("sidebar").classList.toggle("is-open", !desktop && open);
  $("sidebar-backdrop").hidden = desktop || !open;
  $("sidebar-content").inert = !open;
  $("sidebar-toggle").setAttribute("aria-expanded", String(open));
}
function closeSidebar() {
  setSidebarOpen(false);
}
function setupSidebar() {
  const desktop = window.matchMedia(DESKTOP_MEDIA);
  setSidebarOpen(desktop.matches);
  $("sidebar-toggle").onclick = () => setSidebarOpen(!isSidebarOpen());
  $("sidebar-backdrop").onclick = closeSidebar;
  desktop.addEventListener("change", (event) => setSidebarOpen(event.matches));
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
    (Object.values(data.config.axes).some((axis) => axis.topic === topic) ||
      Object.values(data.config.subtopics).some((sub) => sub.topic === topic));
  $("search").value = "";
  $("type-filter").value = "";
  $("read-status").value = "";
  if (guideOpen) $("sort").value = "added";
  if (nextSubtopic) {
    const axis = data.config.subtopics[nextSubtopic].axis;
    if (axis) expandedAxes.add(axis);
  }
  if (nextTopic && !nextCollection) expandedTopics.add(nextTopic);
  if (!isDesktop()) closeSidebar();
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
  const label = currentLanguage === "en" ? "Awaiting classification" : "待核对分类";
  const axes = Object.entries(config.axes || {});
  if (axes.length) {
    for (const [axisId, axis] of axes) {
      const missing = entries.filter((paper) => paper.topics.includes(axis.topic) &&
        !paper.subtopics.some((id) => config.subtopics[id]?.axis === axisId));
      if (!missing.length) continue;
      const id = "pending-" + axisId;
      config.subtopics[id] = { topic: axis.topic, axis: axisId, pending: true, label };
      for (const paper of missing) paper.subtopics.push(id);
    }
    return;
  }
  const topicIds = new Set(Object.values(config.subtopics || {}).map((s) => s.topic));
  for (const topicId of topicIds) {
    const missing = entries.filter((paper) => paper.topics.includes(topicId) &&
      !paper.subtopics.some((id) => config.subtopics[id]?.topic === topicId));
    if (!missing.length) continue;
    const id = "pending-" + topicId;
    config.subtopics[id] = { topic: topicId, pending: true, label };
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
    const disclosure = node("button", "topic-disclosure");
    disclosure.append(chevronSvg());
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
      const axes = Object.entries(data.config.axes || {}).filter(
        ([, axis]) => axis.topic === id,
      );
      if (axes.length) {
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
      } else {
        for (const [sid, child] of Object.entries(data.config.subtopics).filter(
          ([, s]) => s.topic === id,
        )) {
          const count = data.entries.filter(
            (p) =>
              p.topics.includes(id) &&
              p.subtopics.includes(sid),
          ).length;
          if (!count) continue;
          children.append(
            navButton(
              child.label,
              count,
              subtopic === sid,
              () => selectView(id, sid),
              "subtopic",
            ),
          );
        }
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
  const details = node("details", "guide-details");
  details.append(node("summary", "", t(collection ? "专题介绍" : "主题说明与阅读建议")));
  details.append(node("p", "guide-summary", guide.summary));
  const points = node("ul", "guide-points");
  for (const point of guide.points) points.append(node("li", "", point));
  details.append(points);
  if (guide.reading_order.length) {
    const reading = node("div", "guide-reading");
    reading.append(node("span", "", t("建议阅读")));
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
      node(
        "span",
        "reading-status " + (p.entry_kind === "reference" ? "is-reference" : "is-card"),
        t(p.entry_kind === "reference" ? "文献索引 · 待精读" : "精读卡片"),
      ),
      node("span", "type", t(typeLabels[p.paper_type])),
      node("span", "meta-dot", "·"),
      node("span", "meta-year", String(p.year)),
    );
    if (p.has_fulltext_zh)
      meta.append(node("span", "fulltext-badge", t("双语全文")));
    if (p.entry_kind === "card" && language === "en" && !p.translations?.en)
      meta.append(node("span", "example-label", t("英文翻译待补充")));
    if (p.origin === "example")
      meta.append(node("span", "example-label", t("示例论文")));
    const bottom = node("div", "paper-bottom");
    const tags = node("div", "paper-tags");
    for (const topicId of p.topics)
      tags.append(node("span", "tag-topic", data.config.topics[topicId]));
    const previewTags = [];
    const seenAxes = new Set();
    for (const s of [
      ...[subtopic].filter((id) => id && p.subtopics.includes(id)),
      ...p.subtopics,
    ]) {
      const category = data.config.subtopics[s];
      if (!category || category.pending) continue;
      if (category.axis) {
        if (!seenAxes.has(category.axis)) {
          seenAxes.add(category.axis);
          previewTags.push(s);
        }
      } else if (!previewTags.includes(s)) {
        previewTags.push(s);
      }
    }
    for (const s of previewTags.slice(0, 3))
      tags.append(node("span", "tag-subtopic", data.config.subtopics[s].label));
    const time = node("time", "", p.added_at + " " + t("收录"));
    time.dateTime = p.added_at;
    const cta = node("span", "card-cta", t(p.entry_kind === "reference" ? "查看文献" : "阅读卡片") + " →");
    const footer = node("div", "paper-footer");
    footer.append(time, cta);
    bottom.append(tags, footer);
    row.append(
      meta,
      node("h3", "", p.title),
      node("p", "", p.one_liner),
      bottom,
    );
    row.addEventListener("click", () => {
      savedScroll = window.scrollY;
    });
    $("papers").append(row);
  }
  updateQuery();
}
const mathSymbols = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ϵ", varepsilon: "ε",
  zeta: "ζ", eta: "η", theta: "θ", vartheta: "ϑ", iota: "ι", kappa: "κ",
  lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π", rho: "ρ", varrho: "ϱ",
  sigma: "σ", tau: "τ", upsilon: "υ", phi: "ϕ", varphi: "φ", chi: "χ",
  psi: "ψ", omega: "ω", Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ",
  Xi: "Ξ", Pi: "Π", Sigma: "Σ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
  sum: "∑", prod: "∏", int: "∫", oint: "∮", cdot: "·", cdots: "⋯",
  ldots: "…", dots: "…", times: "×", div: "÷", pm: "±", mp: "∓",
  le: "≤", leq: "≤", ge: "≥", geq: "≥", ne: "≠", neq: "≠",
  approx: "≈", equiv: "≡", sim: "∼", simeq: "≃", propto: "∝",
  in: "∈", notin: "∉", subset: "⊂", subseteq: "⊆", supset: "⊃", supseteq: "⊇",
  cup: "∪", cap: "∩", emptyset: "∅", varnothing: "∅", forall: "∀", exists: "∃",
  neg: "¬", land: "∧", lor: "∨", to: "→", rightarrow: "→", leftarrow: "←",
  leftrightarrow: "↔", Rightarrow: "⇒", Leftarrow: "⇐", Leftrightarrow: "⇔",
  mapsto: "↦", infty: "∞", partial: "∂", nabla: "∇", circ: "∘",
  oplus: "⊕", otimes: "⊗", langle: "⟨", rangle: "⟩", lceil: "⌈", rceil: "⌉",
  lfloor: "⌊", rfloor: "⌋", mid: "∣", parallel: "∥", ell: "ℓ", hbar: "ℏ",
  prime: "′", star: "⋆", dagger: "†",
};
const mathOperators = new Set([
  "arg", "max", "min", "sup", "inf", "lim", "log", "ln", "exp",
  "sin", "cos", "tan", "Pr", "det", "dim", "rank", "tr",
  "softmax", "argmax", "argmin", "var", "cov",
]);
const mathBlackboard = {
  R: "ℝ", E: "𝔼", N: "ℕ", Z: "ℤ", P: "ℙ", Q: "ℚ", C: "ℂ", 1: "𝟙",
};
function renderMath(tex, display = false) {
  const wrap = node(display ? "div" : "span", display ? "math-block" : "math-inline");
  const cur = { s: tex.trim(), i: 0 };
  const skip = () => {
    while (cur.i < cur.s.length && /\s/.test(cur.s[cur.i])) cur.i += 1;
  };
  const readCommand = () => {
    cur.i += 1;
    if (cur.i >= cur.s.length) return "";
    const ch = cur.s[cur.i];
    if (!/[A-Za-z]/.test(ch)) {
      cur.i += 1;
      return ch;
    }
    const start = cur.i;
    while (cur.i < cur.s.length && /[A-Za-z]/.test(cur.s[cur.i])) cur.i += 1;
    return cur.s.slice(start, cur.i);
  };
  const readRawGroup = () => {
    skip();
    if (cur.s[cur.i] !== "{") return cur.s[cur.i++] || "";
    cur.i += 1;
    let depth = 1;
    const start = cur.i;
    while (cur.i < cur.s.length && depth > 0) {
      if (cur.s[cur.i] === "\\") cur.i += 2;
      else if (cur.s[cur.i] === "{") { depth += 1; cur.i += 1; }
      else if (cur.s[cur.i] === "}") { depth -= 1; cur.i += 1; }
      else cur.i += 1;
    }
    return cur.s.slice(start, cur.i - (depth === 0 ? 1 : 0));
  };
  const readGroup = () => {
    skip();
    if (cur.s[cur.i] === "{") {
      cur.i += 1;
      return parseSeq(true);
    }
    return readAtom();
  };
  const readAtom = () => {
    skip();
    if (cur.i >= cur.s.length) return document.createTextNode("");
    const ch = cur.s[cur.i];
    if (ch === "{") {
      cur.i += 1;
      return parseSeq(true);
    }
    if (ch === "\\") {
      const cmd = readCommand();
      if (cmd === "frac" || cmd === "dfrac" || cmd === "tfrac") {
        const box = node("span", "m-frac");
        const num = node("span", "m-num");
        const den = node("span", "m-den");
        num.append(readGroup());
        den.append(readGroup());
        box.append(num, den);
        return box;
      }
      if (cmd === "sqrt") {
        skip();
        if (cur.s[cur.i] === "[") {
          while (cur.i < cur.s.length && cur.s[cur.i] !== "]") cur.i += 1;
          if (cur.s[cur.i] === "]") cur.i += 1;
        }
        const box = node("span", "m-sqrt");
        box.append(node("span", "m-rad", "√"));
        const inner = node("span", "m-radicand");
        inner.append(readGroup());
        box.append(inner);
        return box;
      }
      if (cmd === "text" || cmd === "mathrm" || cmd === "operatorname") {
        const span = node("span", "m-text");
        span.textContent = readRawGroup();
        return span;
      }
      if (cmd === "mathbf" || cmd === "boldsymbol") {
        const span = node("span", "m-bold");
        span.append(readGroup());
        return span;
      }
      if (cmd === "mathcal") {
        const span = node("span", "m-cal");
        span.append(readGroup());
        return span;
      }
      if (cmd === "mathbb") {
        const raw = readRawGroup().trim();
        return node("span", "m-bb", [...raw].map((c) => mathBlackboard[c] || c).join(""));
      }
      if (cmd === "hat" || cmd === "bar" || cmd === "overline" || cmd === "tilde" || cmd === "vec") {
        const span = node("span", "m-accent m-accent-" + cmd);
        span.append(readGroup());
        return span;
      }
      if (cmd === "left" || cmd === "right") {
        skip();
        if (cur.s[cur.i] === "\\") {
          const next = readCommand();
          if (next === ".") return document.createTextNode("");
          return node("span", "m-delim", mathSymbols[next] || (next === "|" ? "‖" : next));
        }
        const d = cur.s[cur.i++] || "";
        return document.createTextNode(d === "." ? "" : d);
      }
      if (mathOperators.has(cmd)) return node("span", "m-op", cmd);
      if (Object.hasOwn(mathSymbols, cmd)) return document.createTextNode(mathSymbols[cmd]);
      if ([",", ";", ":", " "].includes(cmd) || cmd === "quad" || cmd === "qquad")
        return document.createTextNode(cmd.startsWith("q") ? "  " : "\u2009");
      if (["{", "}", "%", "_", "$", "|", "&", "#"].includes(cmd))
        return document.createTextNode(cmd === "|" ? "‖" : cmd);
      return node("span", "m-op", cmd);
    }
    if (/[0-9]/.test(ch)) {
      const start = cur.i;
      while (cur.i < cur.s.length && /[0-9.]/.test(cur.s[cur.i])) cur.i += 1;
      return node("span", "m-lit", cur.s.slice(start, cur.i));
    }
    if (/[A-Za-z]/.test(ch)) {
      cur.i += 1;
      return node("var", "m-var", ch);
    }
    cur.i += 1;
    if ("+-=<>*/".includes(ch)) return node("span", "m-bin", ch === "-" ? "−" : ch);
    return document.createTextNode(ch);
  };
  const readScriptable = () => {
    const base = readAtom();
    let sub = null;
    let sup = null;
    while (true) {
      skip();
      const ch = cur.s[cur.i];
      if (ch === "_" && !sub) {
        cur.i += 1;
        sub = readGroup();
      } else if (ch === "^" && !sup) {
        cur.i += 1;
        sup = readGroup();
      } else break;
    }
    if (!sub && !sup) return base;
    const holder = node("span", "m-scripted");
    holder.append(base);
    if (sub && sup) {
      const stack = node("span", "m-scripts");
      const supEl = node("sup", "m-sup");
      const subEl = node("sub", "m-sub");
      supEl.append(sup);
      subEl.append(sub);
      stack.append(supEl, subEl);
      holder.append(stack);
    } else if (sup) {
      const supEl = node("sup", "m-sup");
      supEl.append(sup);
      holder.append(supEl);
    } else {
      const subEl = node("sub", "m-sub");
      subEl.append(sub);
      holder.append(subEl);
    }
    return holder;
  };
  function parseSeq(stopOnBrace) {
    const frag = document.createDocumentFragment();
    while (cur.i < cur.s.length) {
      skip();
      if (cur.i >= cur.s.length) break;
      if (stopOnBrace && cur.s[cur.i] === "}") {
        cur.i += 1;
        break;
      }
      frag.append(readScriptable());
    }
    return frag;
  }
  wrap.append(parseSeq(false));
  return wrap;
}
function findInlineMath(text, from) {
  for (let i = from; i < text.length; i += 1) {
    if (text[i] !== "$" || (i > 0 && text[i - 1] === "\\")) continue;
    if (text[i + 1] === "$" || i + 1 >= text.length || /\s/.test(text[i + 1])) continue;
    for (let j = i + 1; j < text.length; j += 1) {
      if (text[j] === "\n") break;
      if (text[j] === "$" && text[j - 1] !== "\\") {
        if (/\s/.test(text[j - 1]) || (j + 1 < text.length && /\d/.test(text[j + 1]))) continue;
        return { index: i, end: j + 1, inner: text.slice(i + 1, j) };
      }
    }
  }
  return null;
}
function appendInlineRich(parent, text) {
  let pos = 0;
  while (pos < text.length) {
    const rest = text.slice(pos);
    const jumpMatch = rest.match(/\[\[p:(\d+)\|([^\]]+)\]\]/);
    const codeMatch = rest.match(/`([^`\n]+)`/);
    const boldMatch = rest.match(/\*\*([^*\n]+?)\*\*/);
    const mathMatch = findInlineMath(text, pos);
    const candidates = [];
    if (jumpMatch) candidates.push({ kind: "jump", index: pos + jumpMatch.index, end: pos + jumpMatch.index + jumpMatch[0].length, page: Number(jumpMatch[1]), inner: jumpMatch[2] });
    if (codeMatch) candidates.push({ kind: "code", index: pos + codeMatch.index, end: pos + codeMatch.index + codeMatch[0].length, inner: codeMatch[1] });
    if (boldMatch) candidates.push({ kind: "bold", index: pos + boldMatch.index, end: pos + boldMatch.index + boldMatch[0].length, inner: boldMatch[1] });
    if (mathMatch) candidates.push({ kind: "math", ...mathMatch });
    if (!candidates.length) {
      parent.append(document.createTextNode(text.slice(pos).replaceAll("\\$", "$")));
      break;
    }
    candidates.sort((a, b) => a.index - b.index);
    const next = candidates[0];
    if (next.index > pos)
      parent.append(document.createTextNode(text.slice(pos, next.index).replaceAll("\\$", "$")));
    if (next.kind === "jump") {
      const btn = node("button", "page-jump-chip", next.inner);
      btn.type = "button";
      btn.dataset.jumpPage = String(next.page);
      parent.append(btn);
    } else if (next.kind === "code") parent.append(node("code", "inline-code", next.inner));
    else if (next.kind === "bold") {
      const strong = node("strong");
      appendInlineRich(strong, next.inner);
      parent.append(strong);
    } else parent.append(renderMath(next.inner, false));
    pos = next.end;
  }
}
function splitTableCells(line) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}
function isTableSeparator(line) {
  const cells = splitTableCells(line);
  return cells.length >= 2 && cells.every((c) => /^:?-{2,}:?$/.test(c));
}
function renderRichText(text) {
  const container = node("div", "reader-rich");
  const lines = String(text || "").split(/\r?\n/);
  let i = 0;
  const isUl = (line) => /^\s*[-*•]\s+(.+)$/.test(line);
  const isOl = (line) => /^\s*\d+[.)]\s+(.+)$/.test(line);
  const isHeading = (line) => /^\s{0,3}(#{1,4})\s+(.+)$/.test(line);
  const isQuote = (line) => /^\s*>\s?(.*)$/.test(line);
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }
    const headingMatch = line.match(/^\s{0,3}(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = Math.min(6, headingMatch[1].length + 2);
      const h = node("h" + level, "rich-heading");
      appendInlineRich(h, headingMatch[2].trim());
      container.append(h);
      i += 1;
      continue;
    }
    if (isQuote(line)) {
      const qLines = [];
      while (i < lines.length && isQuote(lines[i])) {
        qLines.push(lines[i].replace(/^\s*>\s?/, ""));
        i += 1;
      }
      const bq = node("blockquote", "rich-quote");
      qLines.forEach((part, idx) => {
        if (idx > 0) bq.append(document.createElement("br"));
        appendInlineRich(bq, part);
      });
      container.append(bq);
      continue;
    }
    if (line.trim().startsWith("$$")) {
      const single = line.trim().match(/^\$\$(.+)\$\$$/);
      if (single) {
        container.append(renderMath(single[1], true));
        i += 1;
        continue;
      }
      const buf = [line.trim().slice(2)];
      i += 1;
      while (i < lines.length && !lines[i].trim().endsWith("$$")) {
        buf.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) {
        buf.push(lines[i].trim().slice(0, -2));
        i += 1;
      }
      container.append(renderMath(buf.join("\n"), true));
      continue;
    }
    if (i + 1 < lines.length && line.includes("|") && isTableSeparator(lines[i + 1])) {
      const headers = splitTableCells(line);
      const aligns = splitTableCells(lines[i + 1]).map((c) =>
        c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : "left",
      );
      const wrap = node("div", "table-wrap");
      const table = node("table", "rich-table");
      const thead = node("thead");
      const hrow = node("tr");
      headers.forEach((h, idx) => {
        const th = node("th");
        if (aligns[idx] && aligns[idx] !== "left") th.style.textAlign = aligns[idx];
        appendInlineRich(th, h);
        hrow.append(th);
      });
      thead.append(hrow);
      table.append(thead);
      const tbody = node("tbody");
      i += 2;
      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) {
        const row = node("tr");
        const cells = splitTableCells(lines[i]);
        headers.forEach((_, idx) => {
          const td = node("td");
          if (aligns[idx] && aligns[idx] !== "left") td.style.textAlign = aligns[idx];
          appendInlineRich(td, cells[idx] || "");
          row.append(td);
        });
        tbody.append(row);
        i += 1;
      }
      table.append(tbody);
      wrap.append(table);
      container.append(wrap);
      continue;
    }
    if (isUl(line) || isOl(line)) {
      const ordered = isOl(line);
      const list = node(ordered ? "ol" : "ul", "rich-list");
      const matcher = ordered ? /^\s*\d+[.)]\s+(.+)$/ : /^\s*[-*•]\s+(.+)$/;
      while (i < lines.length) {
        const m = lines[i].match(matcher);
        if (!m) break;
        const li = node("li");
        appendInlineRich(li, m[1]);
        list.append(li);
        i += 1;
      }
      container.append(list);
      continue;
    }
    const p = node("p");
    const paraLines = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith("$$") &&
      !isHeading(lines[i]) &&
      !isQuote(lines[i]) &&
      !isUl(lines[i]) &&
      !isOl(lines[i]) &&
      !(i + 1 < lines.length && lines[i].includes("|") && isTableSeparator(lines[i + 1]))
    ) {
      paraLines.push(lines[i].trim());
      i += 1;
    }
    paraLines.forEach((part, idx) => {
      if (idx > 0) p.append(document.createElement("br"));
      appendInlineRich(p, part);
    });
    container.append(p);
  }
  return container;
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
let bilingualCleanup = null;
let pdfjsLoaderPromise = null;
function loadPdfJs() {
  if (pdfjsLoaderPromise) return pdfjsLoaderPromise;
  const sources = [
    {
      lib: "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs",
      worker: "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs",
    },
    {
      lib: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs",
      worker: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs",
    },
  ];
  pdfjsLoaderPromise = (async () => {
    for (const src of sources) {
      try {
        const mod = await import(src.lib);
        mod.GlobalWorkerOptions.workerSrc = src.worker;
        return mod;
      } catch { /* Try next CDN */ }
    }
    throw new Error("PDF.js unavailable");
  })().catch((err) => {
    pdfjsLoaderPromise = null;
    throw err;
  });
  return pdfjsLoaderPromise;
}
function resolvePdfUrl(paper) {
  if (paper.source?.attachment)
    return data.config.repository_url + "/raw/refs/heads/main/" + paper.source.attachment;
  const raw = paper.source?.url || "";
  const arxiv = raw.match(/https?:\/\/arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5}(?:v\d+)?)/i);
  if (arxiv) return "https://arxiv.org/pdf/" + arxiv[1];
  if (paper.source?.format === "pdf" && raw) return raw;
  return "";
}
function fulltextKindLabel(kind) {
  const map = {
    prose: t("正文"),
    figure: t("图表页"),
    references: t("参考文献（略）"),
    appendix_prompt: t("附录提示词"),
    math: t("公式推导"),
  };
  return map[kind] || t("正文");
}
function getPageProgress(pane, selector) {
  const items = pane.querySelectorAll(selector);
  if (!items.length) return { page: 1, progress: 0 };
  const anchor = pane.scrollTop + 28;
  let current = items[0];
  for (const el of items) {
    if (el.offsetTop <= anchor) current = el;
    else break;
  }
  const height = Math.max(1, current.offsetHeight);
  const progress = Math.min(1, Math.max(0, (anchor - current.offsetTop) / height));
  return { page: Number(current.dataset.page) || 1, progress };
}
function scrollPaneToPage(pane, selector, page, progress = 0, smooth = false) {
  const target = pane.querySelector(`${selector}[data-page="${page}"]`);
  if (!target) return;
  const top = Math.max(0, target.offsetTop + progress * target.offsetHeight - 28);
  if (smooth) pane.scrollTo({ top, behavior: "smooth" });
  else pane.scrollTop = top;
}
function renderBilingualReader(paper, reader) {
  document.body.classList.add("bilingual-mode");
  document.title = paper.title + " · " + t("双语全文") + " · Paper Atlas";
  const shell = node("div", "bilingual-shell");
  const toolbar = node("div", "bilingual-toolbar");
  const leftGroup = node("div", "bilingual-toolbar-group");
  const backBtn = link(t("← 返回卡片"), "#paper/" + paper.id, "bilingual-back");
  const titleEl = node("span", "bilingual-title", paper.title);
  leftGroup.append(backBtn, titleEl);

  const centerGroup = node("div", "bilingual-toolbar-group is-nav");
  const prevBtn = node("button", "bilingual-btn", "‹");
  prevBtn.type = "button";
  prevBtn.setAttribute("aria-label", "上一页");
  const pageInput = node("input", "bilingual-page-input");
  pageInput.type = "number";
  pageInput.min = "1";
  pageInput.max = String(paper.source.page_count);
  pageInput.value = "1";
  pageInput.setAttribute("aria-label", "当前页码");
  const totalPagesEl = node("span", "bilingual-page-total", `/ ${paper.source.page_count} 页`);
  const nextBtn = node("button", "bilingual-btn", "›");
  nextBtn.type = "button";
  nextBtn.setAttribute("aria-label", "下一页");
  let syncEnabled = true;
  const syncBtn = node("button", "bilingual-btn is-toggle is-active", t("同步滚动：开"));
  syncBtn.type = "button";
  syncBtn.setAttribute("aria-pressed", "true");
  centerGroup.append(prevBtn, pageInput, totalPagesEl, nextBtn, syncBtn);

  const rightGroup = node("div", "bilingual-toolbar-group is-tools");
  const zoomOutBtn = node("button", "bilingual-btn", "−");
  zoomOutBtn.type = "button";
  zoomOutBtn.title = "缩小 PDF";
  const zoomFitBtn = node("button", "bilingual-btn", t("适应宽度"));
  zoomFitBtn.type = "button";
  const zoomInBtn = node("button", "bilingual-btn", "+");
  zoomInBtn.type = "button";
  zoomInBtn.title = "放大 PDF";
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "application/pdf";
  fileInput.hidden = true;
  const pickPdfBtn = node("button", "bilingual-btn", t("打开本地 PDF"));
  pickPdfBtn.type = "button";
  pickPdfBtn.onclick = () => fileInput.click();
  const modeSelect = node("select", "bilingual-mobile-mode");
  for (const [val, label] of [["split", "双栏对照"], ["zh", "仅看译文"], ["pdf", "仅看原文"]]) {
    const opt = node("option", "", label);
    opt.value = val;
    modeSelect.append(opt);
  }
  const sourceUrl =
    paper.source.url ||
    data.config.repository_url + "/blob/main/" + paper.source.attachment;
  const extLink = link(t("阅读原文 ↗"), sourceUrl, "bilingual-ext", true);
  rightGroup.append(zoomOutBtn, zoomFitBtn, zoomInBtn, pickPdfBtn, fileInput, modeSelect, extLink);
  toolbar.append(leftGroup, centerGroup, rightGroup);

  const panes = node("div", "bilingual-panes");
  const pdfPane = node("div", "bilingual-pane is-pdf");
  const zhPane = node("div", "bilingual-pane is-translation");
  const pdfStatus = node("div", "pdf-status", t("正在加载原文 PDF…"));
  const pdfPagesHost = node("div", "pdf-pages");
  pdfPane.append(pdfStatus, pdfPagesHost);
  zhPane.append(node("div", "pdf-status", t("正在加载中文全文译文…")));
  panes.append(pdfPane, zhPane);
  shell.append(toolbar, panes);
  reader.append(shell);

  modeSelect.onchange = () => {
    panes.dataset.mobileMode = modeSelect.value;
  };
  panes.dataset.mobileMode = "split";

  let destroyed = false;
  let observer = null;
  let activeObjectUrl = "";
  let pdfDoc = null;
  let zoomMultiplier = 1;
  let activeDriver = null;
  let clearDriverTimer = 0;
  let currentPage = 1;

  const setCurrentPage = (pg) => {
    currentPage = Math.min(paper.source.page_count, Math.max(1, pg));
    if (document.activeElement !== pageInput) pageInput.value = String(currentPage);
  };
  const jumpBothToPage = (pg, smooth = true) => {
    const clamped = Math.min(paper.source.page_count, Math.max(1, pg));
    setCurrentPage(clamped);
    activeDriver = "jump";
    window.clearTimeout(clearDriverTimer);
    scrollPaneToPage(pdfPane, ".pdf-page", clamped, 0, smooth);
    scrollPaneToPage(zhPane, ".tr-page", clamped, 0, smooth);
    clearDriverTimer = window.setTimeout(() => { activeDriver = null; }, 450);
  };

  prevBtn.onclick = () => jumpBothToPage(currentPage - 1);
  nextBtn.onclick = () => jumpBothToPage(currentPage + 1);
  pageInput.onchange = () => jumpBothToPage(Number(pageInput.value) || 1);
  syncBtn.onclick = () => {
    syncEnabled = !syncEnabled;
    syncBtn.textContent = t(syncEnabled ? "同步滚动：开" : "同步滚动：关");
    syncBtn.classList.toggle("is-active", syncEnabled);
    syncBtn.setAttribute("aria-pressed", String(syncEnabled));
  };

  const syncScroll = (sourcePane, targetPane, sourceSel, targetSel, driverName) => {
    if (activeDriver && activeDriver !== driverName) return;
    const { page, progress } = getPageProgress(sourcePane, sourceSel);
    setCurrentPage(page);
    if (!syncEnabled) return;
    activeDriver = driverName;
    window.clearTimeout(clearDriverTimer);
    scrollPaneToPage(targetPane, targetSel, page, progress, false);
    clearDriverTimer = window.setTimeout(() => { activeDriver = null; }, 80);
  };
  pdfPane.addEventListener("scroll", () => syncScroll(pdfPane, zhPane, ".pdf-page", ".tr-page", "left"), { passive: true });
  zhPane.addEventListener("scroll", () => syncScroll(zhPane, pdfPane, ".tr-page", ".pdf-page", "right"), { passive: true });

  zhPane.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-jump-page]");
    if (!btn) return;
    const pg = Number(btn.dataset.jumpPage);
    if (pg >= 1) jumpBothToPage(pg);
  });

  const renderPdfWithDoc = async (doc) => {
    if (destroyed) return;
    pdfDoc = doc;
    if (observer) observer.disconnect();
    pdfPagesHost.replaceChildren();
    pdfStatus.hidden = true;
    const firstPage = await doc.getPage(1);
    const baseViewport = firstPage.getViewport({ scale: 1 });
    const availWidth = Math.max(320, pdfPane.clientWidth - 40);
    const fitScale = (availWidth / baseViewport.width) * zoomMultiplier;
    const pageHolders = [];
    for (let num = 1; num <= doc.numPages; num += 1) {
      const holder = node("div", "pdf-page");
      holder.dataset.page = String(num);
      holder.style.width = Math.round(baseViewport.width * fitScale) + "px";
      holder.style.height = Math.round(baseViewport.height * fitScale) + "px";
      holder.append(node("div", "pdf-page-badge", `p. ${num}`));
      pdfPagesHost.append(holder);
      pageHolders.push(holder);
    }
    const rendered = new Set();
    const rendering = new Set();
    const paintPage = async (holder) => {
      const num = Number(holder.dataset.page);
      if (destroyed || rendered.has(num) || rendering.has(num)) return;
      rendering.add(num);
      try {
        const page = await doc.getPage(num);
        if (destroyed) return;
        const vp0 = page.getViewport({ scale: 1 });
        const scale = ((Math.max(320, pdfPane.clientWidth - 40)) / vp0.width) * zoomMultiplier;
        const viewport = page.getViewport({ scale });
        holder.style.width = Math.round(viewport.width) + "px";
        holder.style.height = Math.round(viewport.height) + "px";
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(viewport.width * dpr);
        canvas.height = Math.round(viewport.height * dpr);
        canvas.style.width = Math.round(viewport.width) + "px";
        canvas.style.height = Math.round(viewport.height) + "px";
        const ctx = canvas.getContext("2d");
        await page.render({
          canvasContext: ctx,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null,
        }).promise;
        if (!destroyed) {
          holder.prepend(canvas);
          rendered.add(num);
        }
      } finally {
        rendering.delete(num);
      }
    };
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) paintPage(entry.target);
        }
      },
      { root: pdfPane, rootMargin: "700px 0px" },
    );
    for (const holder of pageHolders) observer.observe(holder);
  };

  const applyZoom = async (nextMultiplier) => {
    zoomMultiplier = Math.min(2.2, Math.max(0.6, nextMultiplier));
    if (!pdfDoc) return;
    const { page, progress } = getPageProgress(pdfPane, ".pdf-page");
    await renderPdfWithDoc(pdfDoc);
    scrollPaneToPage(pdfPane, ".pdf-page", page, progress, false);
  };
  zoomOutBtn.onclick = () => applyZoom(zoomMultiplier - 0.15);
  zoomFitBtn.onclick = () => applyZoom(1);
  zoomInBtn.onclick = () => applyZoom(zoomMultiplier + 0.15);

  const loadPdfSource = async (srcOrBytes) => {
    pdfStatus.hidden = false;
    pdfStatus.textContent = t("正在加载原文 PDF…");
    try {
      const pdfjs = await loadPdfJs();
      const task = typeof srcOrBytes === "string"
        ? pdfjs.getDocument({ url: srcOrBytes, withCredentials: false })
        : pdfjs.getDocument({ data: srcOrBytes });
      const doc = await task.promise;
      await renderPdfWithDoc(doc);
    } catch {
      if (destroyed) return;
      if (typeof srcOrBytes !== "string" && activeObjectUrl) {
        pdfStatus.hidden = true;
        const frame = document.createElement("iframe");
        frame.className = "pdf-native-frame";
        frame.src = activeObjectUrl;
        frame.title = paper.title;
        pdfPagesHost.replaceChildren(frame);
        return;
      }
      pdfPagesHost.replaceChildren();
      pdfStatus.hidden = false;
      pdfStatus.replaceChildren(
        node("p", "pdf-fallback-title", "无法直接跨域加载该 PDF 原文"),
        node("p", "pdf-fallback-desc", "出版商链接可能禁止跨域或当前处于离线状态。你可以直接拖入本地 PDF 文件（仅在浏览器内存渲染，不上传），或新标签页查看原文；右侧中文译文仍可正常阅读。"),
      );
      const fallbackActions = node("div", "pdf-fallback-actions");
      const pick = node("button", "bilingual-btn is-primary", t("打开本地 PDF"));
      pick.type = "button";
      pick.onclick = () => fileInput.click();
      fallbackActions.append(pick, link(t("阅读原文 ↗"), sourceUrl, "bilingual-btn", true));
      pdfStatus.append(fallbackActions);
    }
  };

  const openLocalFile = async (file) => {
    if (!file) return;
    if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
    activeObjectUrl = URL.createObjectURL(file);
    const bytes = new Uint8Array(await file.arrayBuffer());
    await loadPdfSource(bytes);
  };
  fileInput.onchange = () => openLocalFile(fileInput.files?.[0]);
  pdfPane.addEventListener("dragover", (e) => {
    e.preventDefault();
    pdfPane.classList.add("is-dragover");
  });
  pdfPane.addEventListener("dragleave", () => pdfPane.classList.remove("is-dragover"));
  pdfPane.addEventListener("drop", (e) => {
    e.preventDefault();
    pdfPane.classList.remove("is-dragover");
    const file = e.dataTransfer?.files?.[0];
    if (file && (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")))
      openLocalFile(file);
  });

  const remoteUrl = resolvePdfUrl(paper);
  if (remoteUrl) loadPdfSource(remoteUrl);
  else loadPdfSource("");

  fetch(`translations/${encodeURIComponent(paper.id)}.json`, { cache: "no-cache" })
    .then((resp) => {
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      return resp.json();
    })
    .then((doc) => {
      if (destroyed) return;
      zhPane.replaceChildren();
      for (const item of doc.pages) {
        const sec = node("section", `tr-page is-${item.kind || "prose"}`);
        sec.dataset.page = String(item.page);
        const header = node("div", "tr-page-header");
        const meta = node("div", "tr-page-meta");
        meta.append(
          node("span", "tr-page-num", `第 ${item.page} 页`),
          node("span", "tr-page-kind", fulltextKindLabel(item.kind)),
          node("span", "tr-page-label", item.label),
        );
        const alignBtn = node("button", "tr-align-btn", t("对齐左页") + " ⇄");
        alignBtn.type = "button";
        alignBtn.dataset.jumpPage = String(item.page);
        header.append(meta, alignBtn);
        sec.append(header, renderRichText(item.markdown));
        zhPane.append(sec);
      }
      zhPane.append(
        node("p", "tr-end-note", `全文共 ${doc.page_count} 页 · 已保存为页面级双语缓存，下次阅读无需重复翻译。`),
      );
    })
    .catch(() => {
      if (destroyed) return;
      zhPane.replaceChildren(node("div", "pdf-status", "暂时无法加载中文全文译文，请刷新重试。"));
    });

  bilingualCleanup = () => {
    destroyed = true;
    window.clearTimeout(clearDriverTimer);
    if (observer) observer.disconnect();
    if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
    document.body.classList.remove("bilingual-mode");
  };
}
function showRoute() {
  if (bilingualCleanup) {
    bilingualCleanup();
    bilingualCleanup = null;
  }
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
  let id, routeSub = "";
  try {
    const parts = location.hash.slice(7).split("/");
    id = decodeURIComponent(parts[0]);
    routeSub = parts[1] || "";
  } catch {
    id = "";
  }
  const paper = data.entries.find((p) => p.id === id);
  $("library").hidden = true;
  const reader = $("reader");
  reader.hidden = false;
  reader.replaceChildren();
  if (paper && paper.has_fulltext_zh && routeSub === "bilingual") {
    renderBilingualReader(paper, reader);
    return;
  }
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
  if (paper.has_fulltext_zh)
    actions.append(link(t("双语对照全文 →"), "#paper/" + paper.id + "/bilingual", "action-bilingual", false));
  const source =
    paper.source.url ||
    data.config.repository_url + "/blob/main/" + paper.source.attachment;
  actions.append(link(t("阅读原文 ↗"), source, paper.has_fulltext_zh ? "action-secondary" : "", true));
  head.append(actions);
  reader.append(head);
  if (paper.entry_kind === "reference") {
    head.prepend(node("p", "reading-status is-reference", t("文献索引 · 待精读")));
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
    section.append(heading, renderRichText(paper.sections[key].text));
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
      if (event.key === "Escape" && !isDesktop() && isSidebarOpen()) {
        closeSidebar();
        $("sidebar-toggle").focus();
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
