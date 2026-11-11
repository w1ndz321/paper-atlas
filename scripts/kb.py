#!/usr/bin/env python3
"""Paper Atlas: deterministic ingestion, evidence checks, and static publishing.

Codex does the reading and writing. This program never calls a model or needs an API key.
"""
from __future__ import annotations

import argparse
import hashlib
from html.parser import HTMLParser
import io
import json
from pathlib import Path
import re
import shutil
import sys
from datetime import date
import unicodedata
import urllib.request
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
TYPES = ["benchmark", "method", "framework", "dataset", "analysis", "survey", "position"]
SECTIONS = {
    "problem": "研究问题", "gap": "原有做法与缺口", "method": "核心方法",
    "trace": "一个具体例子", "inputs_outputs": "输入与产出", "results": "关键结果与实验条件",
    "contributions": "主要贡献", "limitations": "局限与适用边界", "cost": "成本与复现条件",
    "relevance": "与研究主题的关系",
}
MAX_BYTES = 40 * 1024 * 1024


class Invalid(ValueError):
    pass


def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write(path, obj):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def slug_ok(value):
    return isinstance(value, str) and re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", value)


def normalize(text):
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", text)).strip()


def identity(url):
    m = re.search(r"arxiv\.org/(?:abs|pdf|html)/(\d{4}\.\d{4,5})", url, re.I)
    if m:
        return "arxiv:" + m.group(1)
    return url.strip().rstrip("/").lower()


def safe_url(value):
    parsed = urlparse(value)
    return parsed.scheme in ("https", "http") and bool(parsed.netloc) and not parsed.username and not parsed.password


def config(root=ROOT):
    cfg = read(root / "config.json")
    if not cfg.get("research_topic") or not cfg.get("topics") or not all(slug_ok(k) and isinstance(v, str) and v for k, v in cfg["topics"].items()):
        raise Invalid("config.json 必须包含研究主题和合法的主题分类。")
    for axis in ("subtopics", "collections"):
        values = cfg.get(axis, {})
        if not isinstance(values, dict):
            raise Invalid(axis + " 必须是受控分类对象")
        for key, item in values.items():
            if (not slug_ok(key) or not isinstance(item, dict)
                    or not isinstance(item.get("label"), str) or not item["label"].strip()):
                raise Invalid(axis + " 缺少有效 id 或名称")
            if axis == "subtopics" and (item.get("topic") not in cfg["topics"]
                    or not isinstance(item.get("definition"), str) or not item["definition"].strip()):
                raise Invalid("子类必须指定有效父主题与分类边界")
            if axis == "collections" and key in cfg["topics"]:
                raise Invalid("交叉入口不能同时作为主主题")
            if axis == "collections" and item.get("topic") is not None and item["topic"] not in cfg["topics"]:
                raise Invalid("交叉入口必须属于有效主主题")
    aliases = cfg.get("topic_aliases", {})
    if not isinstance(aliases, dict) or not all(slug_ok(k) and k not in cfg["topics"] and isinstance(v, str) and v in cfg["topics"] for k, v in aliases.items()):
        raise Invalid("主题旧链接必须映射到有效主主题")
    axes = cfg.get("axes", {})
    if not isinstance(axes, dict):
        raise Invalid("分类维度必须是对象")
    for key, axis in axes.items():
        if (not slug_ok(key) or not isinstance(axis, dict) or axis.get("topic") not in cfg["topics"]
                or not all(isinstance(axis.get(x), str) and axis[x].strip() for x in ("label", "question"))):
            raise Invalid("分类维度必须有有效父主题、名称和查询问题")
    for category in cfg.get("subtopics", {}).values():
        if axes and (category.get("axis") not in axes or axes[category["axis"]]["topic"] != category["topic"]):
            raise Invalid("子类与分类维度的父主题必须一致")
    sub_aliases = cfg.get("subtopic_aliases", {})
    if not isinstance(sub_aliases, dict) or not all(slug_ok(k) and k not in cfg.get("subtopics", {})
            and isinstance(v, str) and (not v or v in cfg.get("subtopics", {})) for k, v in sub_aliases.items()):
        raise Invalid("子类旧链接必须映射到有效标签或父主题")
    translations = cfg.get("translations", {})
    if (not isinstance(translations, dict) or not isinstance(translations.get("en", {}), dict)
            or not all(isinstance(k, str) and isinstance(v, str) and v.strip()
                       for k, v in translations.get("en", {}).items())):
        raise Invalid("英文配置翻译必须是非空文字映射")
    return cfg


def records(root=ROOT):
    return [read(p) for p in sorted((root / "papers").glob("*.json"))]


class ArticleText(HTMLParser):
    """Small extraction fallback; PDF is preferable for page-based evidence."""
    def __init__(self):
        super().__init__()
        self.skip = 0
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "nav"):
            self.skip += 1
        if not self.skip and tag in ("p", "div", "section", "h1", "h2", "h3", "li", "tr"):
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in ("script", "style", "nav"):
            self.skip = max(0, self.skip - 1)

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)


def extract(data, content_type=""):
    if data.startswith(b"%PDF"):
        try:
            from pypdf import PdfReader
        except ImportError as exc:
            raise Invalid("请先安装依赖：python -m pip install -r requirements.txt") from exc
        try:
            pdf = PdfReader(io.BytesIO(data))
            pages = [{"page": i + 1, "text": p.extract_text() or ""} for i, p in enumerate(pdf.pages)]
        except Exception as exc:
            raise Invalid("PDF 无法读取，可能已加密或损坏。请提供可读原文。") from exc
        if not pages or sum(len(p["text"].strip()) >= 80 for p in pages) < len(pages) * .5:
            raise Invalid("PDF 缺少可提取文字，可能是扫描件。请先 OCR 或提供可读全文，不能只凭摘要收录。")
        kind = "pdf"
    elif "html" in content_type or data.lstrip().startswith((b"<!DOCTYPE", b"<!doctype", b"<html")):
        parser = ArticleText()
        parser.feed(data.decode("utf-8", errors="replace"))
        pages = [{"page": 1, "text": "".join(parser.parts)}]
        kind = "html"
    else:
        pages = [{"page": 1, "text": data.decode("utf-8", errors="replace")}]
        kind = "text"
    if sum(len(p["text"].strip()) for p in pages) < 700:
        raise Invalid("来源文字不足，未确认获得论文全文。请换用 PDF 或全文链接。")
    return kind, pages


def download(url):
    if not safe_url(url):
        raise Invalid("只接受不含账号密码的 HTTP(S) 论文来源链接。")
    m = re.fullmatch(r"https?://arxiv\.org/abs/(\d{4}\.\d{4,5}(?:v\d+)?)/*", url)
    fetch_url = "https://arxiv.org/pdf/" + m.group(1) if m else url
    request = urllib.request.Request(fetch_url, headers={"User-Agent": "PaperAtlas/1.0 (personal research library)"})
    with urllib.request.urlopen(request, timeout=60) as response:
        if not safe_url(response.url):
            raise Invalid("来源重定向到了不支持的地址。")
        data = response.read(MAX_BYTES + 1)
        kind = response.headers.get("Content-Type", "")
    if len(data) > MAX_BYTES:
        raise Invalid("来源超过 40 MB，请提供较小的可读版本。")
    return data, kind


def prepare(args, root=ROOT):
    if not slug_ok(args.id):
        raise Invalid("id 必须是英文小写单词，以短横线连接。")
    existing = records(root)
    own = next((p for p in existing if p["id"] == args.id), None)
    if own and not args.update:
        raise Invalid("该论文已收录；修订时使用 --update，避免覆盖。")
    if args.url:
        for paper in existing:
            if paper["id"] != args.id and identity(paper["source"]["url"]) == identity(args.url):
                raise Invalid("相同论文已收录为 " + paper["id"])
    queue_path = root / "inbox" / (args.id + ".json")
    entry = {"id": args.id, "source_url": args.url or "", "status": "awaiting_summary", "added_at": str(date.today())}
    try:
        cached_pdf = getattr(args, "cached_pdf", None)
        if cached_pdf and (args.pdf or not args.url):
            raise Invalid("--cached-pdf 需要官方 --url，不能同时使用 --pdf。")
        if args.pdf or cached_pdf:
            path = Path(args.pdf or cached_pdf)
            if path.stat().st_size > MAX_BYTES:
                raise Invalid("PDF 超过 40 MB。")
            data, content_type = path.read_bytes(), "application/pdf"
            if not data.startswith(b"%PDF"):
                raise Invalid("--pdf 需要一个真实的 PDF 文件。")
        else:
            data, content_type = download(args.url)
        digest = hashlib.sha256(data).hexdigest()
        for paper in existing:
            if paper["id"] != args.id and paper["source"]["sha256"] == digest:
                raise Invalid("相同文件已收录为 " + paper["id"])
        kind, pages = extract(data, content_type)
        if kind == "pdf" and not args.pdf:
            archive = root / "pdfs" / (args.id + ".pdf")
            archive.parent.mkdir(exist_ok=True)
            archive.write_bytes(data)
            archive_path = root / "pdfs" / "manifest.json"
            archive_manifest = read(archive_path) if archive_path.exists() else {}
            archive_url = re.sub(r"^(https?://arxiv\.org)/abs/", r"\1/pdf/", args.url)
            archive_manifest[args.id] = {"url": archive_url, "source_url": args.url,
                                         "sha256": digest, "page_count": len(pages),
                                         "file": "pdfs/" + args.id + ".pdf", "downloaded_at": str(date.today())}
            write(archive_path, archive_manifest)
    except Exception as exc:
        entry.update(status="needs_source", error=str(exc))
        write(queue_path, entry)
        raise Invalid(str(exc)) from exc
    source = {"url": args.url or "", "sha256": digest, "format": kind, "page_count": len(pages), "attachment": ""}
    if args.pdf:
        attachment = root / "attachments" / (args.id + ".pdf")
        attachment.parent.mkdir(exist_ok=True)
        attachment.write_bytes(data)
        source["attachment"] = attachment.relative_to(root).as_posix()
    folder = root / ".local" / args.id
    write(folder / "source.json", {**source, "pages": pages})
    folder.joinpath("fulltext.txt").write_text("\n\n".join(f"=== PAGE {p['page']} ===\n{p['text']}" for p in pages), encoding="utf-8")
    draft = {
        "schema_version": 1, "id": args.id, "origin": "user", "title": "", "authors": [], "year": date.today().year,
        "paper_type": "method", "topics": [], "tags": [], "one_liner": "",
        "subtopics": own.get("subtopics", []) if own else [],
        "collections": own.get("collections", []) if own else [],
        "classification_reason": own.get("classification_reason", "") if own else "",
        "added_at": own["added_at"] if own else str(date.today()), "updated_at": str(date.today()),
        "source": source, "read_scope": "full", "sections": {k: {"text": "", "evidence": []} for k in SECTIONS},
        "evidence": [], "related": [],
        "review": {"evidence_checked": False, "compression_checked": False, "reviewed_by": "Codex", "prompt_version": "1.7"},
    }
    if own and "rsi_evidence" in own:
        draft["rsi_evidence"] = own["rsi_evidence"]
    write(folder / "draft.json", draft)
    write(queue_path, entry)
    print(f"已提取 {len(pages)} 页。阅读 {folder / 'fulltext.txt'}，按 prompts/ 总结并填写 {folder / 'draft.json'}。")


def check_record(p, cfg, ids, root=ROOT, source=None):
    """Validate data contract; source, when available, proves excerpt matches extracted page."""
    errors = []
    def need(condition, message):
        if not condition:
            errors.append(message)
    need(p.get("schema_version") == 1, "schema_version 必须为 1")
    need(p.get("origin", "user") in ("user", "example"), "origin 必须为 user 或 example")
    need(bool(slug_ok(p.get("id"))), "非法 id")
    for k in ("title", "one_liner", "added_at", "updated_at"):
        need(isinstance(p.get(k), str) and bool(p[k].strip()), k + " 不能为空")
    for k in ("added_at", "updated_at"):
        try:
            date.fromisoformat(p.get(k, ""))
        except (ValueError, TypeError):
            errors.append(k + " 日期无效")
    need(isinstance(p.get("year"), int) and not isinstance(p.get("year"), bool) and 1900 <= p["year"] <= date.today().year + 1, "年份无效")
    need(isinstance(p.get("authors"), list) and len(p["authors"]) > 0 and all(isinstance(a, str) and a.strip() for a in p["authors"]), "作者缺失")
    need(p.get("paper_type") in TYPES, "非法文章类型")
    topics = p.get("topics", [])
    need(isinstance(topics, list) and bool(topics) and all(isinstance(t, str) and t in cfg["topics"] for t in topics), "主题缺失或不属于受控分类")
    for axis in ("subtopics", "collections"):
        values = p.get(axis, [])
        valid = (isinstance(values, list) and all(isinstance(x, str) and x in cfg.get(axis, {}) for x in values)
                 and len(values) == len(set(values)))
        need(valid, axis + " 必须使用不重复的受控分类")
        if axis == "subtopics" and valid:
            parents = {cfg[axis][x]["topic"] for x in values}
            need(isinstance(topics, list) and all(isinstance(t, str) for t in topics) and parents.issubset(topics), "子类与父主题不一致")
            for parent in {x["topic"] for x in cfg.get(axis, {}).values()}:
                if isinstance(topics, list) and parent in topics:
                    need(parent in parents, parent + " 缺少适用子类")
            for key, dimension in cfg.get("axes", {}).items():
                if isinstance(topics, list) and dimension["topic"] in topics:
                    need(any(cfg[axis][x].get("axis") == key for x in values), key + " 缺少维度标签")
        if axis == "collections" and valid:
            for value in values:
                parent = cfg[axis][value].get("topic")
                need(parent is None or isinstance(topics, list) and parent in topics, "交叉入口与父主题不一致")
    if "subtopics" in cfg:
        reason = p.get("classification_reason", "")
        need(isinstance(reason, str) and len(reason.strip()) >= 12, "缺少实质归类依据")
    if cfg.get("axes") and isinstance(topics, list) and "rsi" in topics:
        proof = p.get("rsi_evidence", {})
        need(isinstance(proof, dict) and all(isinstance(proof.get(k), str) and len(proof[k].strip()) >= (4 if k == "status" else 8)
             for k in ("status", "next_round_role", "fixed_components", "capability_evidence")), "RSI 必须说明递归回流、固定组件与改进能力证据")
    need(isinstance(p.get("tags"), list) and all(isinstance(t, str) and t.strip() for t in p["tags"]), "tags 必须是文字列表")
    need(p.get("read_scope") == "full", "未阅读全文，不能作为完成卡片发布")
    src = p.get("source", {})
    need(isinstance(src, dict), "source 应是对象")
    if not isinstance(src, dict):
        src = {}
    attachment = src.get("attachment", "")
    if attachment:
        need(bool(re.fullmatch(r"attachments/[a-z0-9-]+\.pdf", attachment)), "附件路径无效")
        need((root / attachment).is_file() and (root / attachment).resolve().is_relative_to(root.resolve()), "附件不存在或超出仓库")
    need(safe_url(src.get("url", "")) or bool(attachment), "缺少原文链接或附件")
    need(not src.get("url") or safe_url(src["url"]), "来源链接无效")
    need(bool(re.fullmatch(r"[a-f0-9]{64}", src.get("sha256", ""))), "来源哈希缺失")
    need(isinstance(src.get("page_count"), int) and src["page_count"] > 0, "来源页数无效")
    need(src.get("format") in ("pdf", "html", "text"), "来源格式无效")
    evidence = p.get("evidence", [])
    need(isinstance(evidence, list) and len(evidence) >= 3, "至少需要三处原文证据")
    evidence_ids = set()
    for e in evidence if isinstance(evidence, list) else []:
        if not isinstance(e, dict):
            errors.append("证据必须是对象")
            continue
        eid = e.get("id", "")
        need(bool(re.fullmatch(r"e[1-9][0-9]*", eid)) and eid not in evidence_ids, "证据 id 无效或重复")
        evidence_ids.add(eid)
        need(isinstance(e.get("locator"), str) and bool(e["locator"].strip()), "证据定位缺失")
        quote = e.get("quote", "")
        need(isinstance(quote, str) and len(quote.strip()) >= 8, "证据摘录过短或缺失")
        page = e.get("page")
        need(isinstance(page, int) and not isinstance(page, bool) and 1 <= page <= src.get("page_count", 0), "证据页码越界")
        if source and isinstance(quote, str):
            page_text = next((x["text"] for x in source["pages"] if x["page"] == page), "")
            need(normalize(quote) in normalize(page_text), f"证据 {eid} 不能在所标注页中找到")
    sections = p.get("sections", {})
    need(isinstance(sections, dict) and set(sections) == set(SECTIONS), "固定卡片章节缺失或多余")
    for key in SECTIONS:
        section = sections.get(key, {}) if isinstance(sections, dict) else {}
        if not isinstance(section, dict):
            errors.append(key + " 应是对象")
            continue
        text = section.get("text", "")
        need(isinstance(text, str) and len(text.strip()) >= 12, key + " 内容不足")
        citations = section.get("evidence", [])
        need(isinstance(citations, list) and all(c in evidence_ids for c in citations if isinstance(c, str)) and all(isinstance(c, str) for c in citations), key + " 引用了不存在的证据")
        if key not in ("relevance", "cost"):
            need(bool(citations), key + " 缺少证据引用")
    review = p.get("review", {})
    need(isinstance(review, dict) and review.get("evidence_checked") is True and review.get("compression_checked") is True and bool(review.get("reviewed_by")) and bool(review.get("prompt_version")), "未完成证据与压缩质量复核")
    if source is None:
        need(isinstance(review, dict) and review.get("evidence_verified_sha256") == src.get("sha256"), "缺少 finalize 的来源核验记录")
    for rel in p.get("related", []):
        need(isinstance(rel, dict) and rel.get("id") in ids and rel.get("id") != p.get("id") and bool(rel.get("reason")), "关联论文不存在、自关联或缺少原因")
    translations = p.get("translations", {})
    need(isinstance(translations, dict), "翻译必须是对象")
    english = translations.get("en") if isinstance(translations, dict) else None
    if english is not None:
        need(isinstance(english, dict), "英文卡片必须是对象")
        if isinstance(english, dict):
            need(english.get("source_sha256") == src.get("sha256"), "英文卡片与来源版本不一致")
            need(isinstance(english.get("one_liner"), str) and len(english["one_liner"].strip()) >= 12, "英文概述缺失")
            for key, expected in (("sections", set(SECTIONS)), ("locators", evidence_ids),
                                  ("related", {r.get("id") for r in p.get("related", []) if isinstance(r, dict)})):
                values = english.get(key)
                need(isinstance(values, dict) and set(values) == expected
                     and all(isinstance(v, str) and v.strip() for v in values.values()), "英文卡片 " + key + " 缺失或引用不一致")
    if source:
        need(source["sha256"] == src.get("sha256"), "草稿与提取来源版本不一致")
    return errors


def reading_lists(root, papers, cfg):
    """Source-checked discovery records are separate from full-text reviewed cards."""
    path = root / "reading_lists.json"
    if not path.exists():
        return {"schema_version": 1, "lists": {}, "references": []}
    manifest = read(path)
    if (manifest.get("schema_version") != 1 or not isinstance(manifest.get("lists"), dict)
            or not isinstance(manifest.get("references"), list)):
        raise Invalid("reading_lists.json 格式无效")
    known = {p["id"]: p for p in papers}
    identities = {identity(p["source"]["url"]): p["id"] for p in papers if p["source"].get("url")}
    seen = set()
    for ref in manifest["references"]:
        if not isinstance(ref, dict) or not slug_ok(ref.get("id")) or ref["id"] in seen:
            raise Invalid("文献索引 id 无效或重复")
        seen.add(ref["id"])
        if (not all(isinstance(ref.get(k), str) and ref[k].strip() for k in
                    ("title", "one_liner", "one_liner_en", "context", "context_en"))
                or not isinstance(ref.get("authors"), list) or not ref["authors"]
                or not all(isinstance(a, str) and a.strip() for a in ref["authors"])
                or type(ref.get("year")) is not int or not 1900 <= ref["year"] <= date.today().year
                or ref.get("paper_type") not in TYPES
                or ref.get("source_basis") not in ("abstract", "official-summary", "official-paper")
                or not safe_url(ref.get("source_url", ""))
                or urlparse(ref["source_url"]).scheme != "https"):
            raise Invalid(ref["id"] + ": 文献索引缺少双语简介、作者、年份或有效来源")
        try:
            if date.fromisoformat(ref["verified_at"]) > date.today():
                raise ValueError()
        except (KeyError, TypeError, ValueError):
            raise Invalid(ref["id"] + ": 来源核对日期无效")
        key = identity(ref["source_url"])
        if key in identities and identities[key] != ref["id"]:
            raise Invalid(ref["id"] + ": 文献索引与其他文章来源重复")
        # A later full-text ingestion can promote the same id, preserving shared links.
        if ref["id"] in known and identity(known[ref["id"]]["source"]["url"]) != key:
            raise Invalid(ref["id"] + ": 精读卡片与索引来源不一致")
        identities[key] = ref["id"]
    ids = set(known) | seen
    referenced = set()
    for group, members in manifest["lists"].items():
        if group not in cfg["topics"] and group not in cfg.get("collections", {}):
            raise Invalid("文献清单分类无效：" + group)
        if (not isinstance(members, list) or not members or not all(isinstance(i, str) for i in members)
                or len(members) != len(set(members)) or not set(members) <= ids):
            raise Invalid(group + ": 文献清单包含重复或不存在的文章")
        axis = "topics" if group in cfg["topics"] else "collections"
        if any(group not in known[i].get(axis, []) for i in members if i in known):
            raise Invalid(group + ": 精读卡片的分类与清单不一致")
        referenced.update(members)
    if not seen <= referenced:
        raise Invalid("文献索引存在未归入清单的文章")
    return manifest


def validate(root=ROOT):
    cfg = config(root)
    papers = records(root)
    ids = {p.get("id") for p in papers}
    errors, seen = [], {}
    for path, p in zip(sorted((root / "papers").glob("*.json")), papers):
        if path.stem != p.get("id"):
            errors.append(f"{path.name}: 文件名与 id 不符")
        for error in check_record(p, cfg, ids, root):
            errors.append(f"{path.name}: {error}")
        key = identity(p.get("source", {}).get("url", "")) or p.get("source", {}).get("sha256")
        if key in seen:
            errors.append(f"{path.name}: 与 {seen[key]} 重复")
        seen[key] = p.get("id")
        if p.get("source", {}).get("attachment"):
            attachment = root / p["source"]["attachment"]
            if attachment.is_file() and hashlib.sha256(attachment.read_bytes()).hexdigest() != p["source"]["sha256"]:
                errors.append(f"{path.name}: 附件哈希不一致")
    for axis, guides in (("topics", cfg.get("topic_guides", {})), ("collections", cfg.get("collections", {}))):
        if not isinstance(guides, dict):
            errors.append("导读必须是按入口组织的对象")
            continue
        by_id = {p.get("id"): p for p in papers}
        for topic, guide in guides.items():
            if (topic not in cfg.get(axis, {}) or not isinstance(guide, dict)
                    or not isinstance(guide.get("summary"), str) or not guide["summary"].strip()
                    or not isinstance(guide.get("points"), list)
                    or not all(isinstance(x, str) and x.strip() for x in guide["points"])
                    or not isinstance(guide.get("reading_order"), list)):
                errors.append(f"{topic}: 主题导读缺少有效内容")
                continue
            for item in guide["reading_order"]:
                if (not isinstance(item, dict) or not isinstance(item.get("label"), str) or not item["label"].strip()
                        or not isinstance(item.get("id"), str)
                        or item.get("id") not in by_id or topic not in by_id[item["id"]].get(axis, [])):
                    errors.append(f"{topic}: 推荐阅读必须指向本主题已收录的论文")
            questions = guide.get("questions", [])
            if not isinstance(questions, list):
                errors.append(f"{topic}: 问题入口必须是列表")
                questions = []
            for question in questions:
                if (not isinstance(question, dict) or not all(isinstance(question.get(k), str) and question[k].strip() for k in ("question", "label"))
                        or ("axis" in question) == ("view" in question)
                        or "axis" in question and (question["axis"] not in cfg.get("axes", {}) or cfg["axes"][question["axis"]]["topic"] != topic)
                        or "view" in question and question["view"] not in ("works", "recent", "year")):
                    errors.append(f"{topic}: 问题入口必须指向本主题维度或有效视图")
    if errors:
        raise Invalid("\n".join(errors))
    reading_lists(root, papers, cfg)
    return papers


def markdown(p, cfg):
    src = p["source"]["url"] or "../" + p["source"]["attachment"]
    out = [f"# {p['title']}", "", p["one_liner"], "", f"- 作者：{', '.join(p['authors'])}",
           f"- 年份：{p['year']} · 类型：{p['paper_type']}", f"- 主题：{' / '.join(cfg['topics'][x] for x in p['topics'])}",
           f"- [原文]({src}) · 收录：{p['added_at']} · 更新：{p['updated_at']}", ""]
    if p.get("subtopics"):
        out.extend(["- 子类：" + " / ".join(cfg["subtopics"][x]["label"] for x in p["subtopics"]), ""])
    if p.get("collections"):
        out.extend(["- 交叉入口：" + " / ".join(cfg["collections"][x]["label"] for x in p["collections"]), ""])
    if p.get("classification_reason"):
        out.extend(["归类依据（知识库分析）：" + p["classification_reason"], ""])
    if p.get("rsi_evidence"):
        out.extend(["## 递归闭环与证据边界（知识库分析）", ""])
        for key, label in (("status", "证据状态"), ("next_round_role", "下一轮职责"), ("fixed_components", "固定组件"), ("capability_evidence", "改进能力证据")):
            out.extend([f"- {label}：{p['rsi_evidence'][key]}", ""])
    for key, label in SECTIONS.items():
        s = p["sections"][key]
        out.extend(["## " + label, "", s["text"], "", "证据：" + ", ".join(s["evidence"]) if s["evidence"] else "研究关联分析；未作为论文结论。", ""])
    out.extend(["## 原文证据", ""])
    for e in p["evidence"]:
        out.extend([f"### {e['id']} · {e['locator']} · 来源页 {e['page']}", "", "> " + e["quote"].replace("\n", " "), ""])
    out.extend(["## 相关论文", ""])
    out.extend(f"- [{r['id']}]({r['id']}.md)：{r['reason']}" for r in p["related"])
    if not p["related"]:
        out.append("暂无明确关联的已收录论文。")
    return "\n".join(out) + "\n"


def render_cards(root=ROOT, check=False):
    cfg = config(root)
    papers = validate(root)
    expected = {p["id"] + ".md": markdown(p, cfg) for p in papers}
    folder = root / "cards"
    folder.mkdir(exist_ok=True)
    if check:
        actual = {p.name: p.read_text(encoding="utf-8") for p in folder.glob("*.md")}
        if actual != expected:
            raise Invalid("cards/ 与 papers/ 不一致。请运行 python scripts/kb.py render。")
    else:
        for path in folder.glob("*.md"):
            if path.name not in expected:
                path.unlink()
        for name, value in expected.items():
            folder.joinpath(name).write_text(value, encoding="utf-8")


def finalize(args, root=ROOT):
    validate(root)
    p = read(args.draft)
    if not slug_ok(p.get("id")):
        raise Invalid("草稿 id 无效")
    target = root / "papers" / (p["id"] + ".json")
    if target.exists() and not args.update:
        raise Invalid("已有卡片不能直接覆盖。修订请使用 --update。")
    source_path = root / ".local" / p["id"] / "source.json"
    if not source_path.exists():
        raise Invalid("缺少提取来源。先运行 prepare，才能验证证据。")
    source = read(source_path)
    papers = records(root)
    errors = check_record(p, config(root), {x["id"] for x in papers} | {p["id"]}, root, source)
    for old in papers:
        if old["id"] != p["id"] and ((p["source"]["url"] and identity(old["source"]["url"]) == identity(p["source"]["url"])) or old["source"]["sha256"] == p["source"]["sha256"]):
            errors.append("与已收录论文重复：" + old["id"])
    if errors:
        raise Invalid("\n".join(errors))
    if target.exists():
        p["added_at"] = read(target)["added_at"]
    p["updated_at"] = str(date.today())
    p["review"]["evidence_verified_sha256"] = source["sha256"]
    write(target, p)
    render_cards(root)
    queue_path = root / "inbox" / (p["id"] + ".json")
    if queue_path.exists():
        queue_path.unlink()
    print("已完成原文摘录核验并收录：" + p["id"])


def build(output, root=ROOT):
    papers = validate(root)
    render_cards(root, check=True)
    cfg = config(root)
    output = Path(output).resolve()
    # Never delete a user-selected directory; only overwrite our own named build files.
    if output == root.resolve() or output.is_relative_to((root / "papers").resolve()) or root.resolve().is_relative_to(output):
        raise Invalid("构建目录不能覆盖仓库或论文数据。")
    output.mkdir(parents=True, exist_ok=True)
    for name in ("index.html", "locale.js", "app.js", "style.css"):
        shutil.copyfile(root / "web" / name, output / name)
    # A new data schema must not run against an older browser-cached reader.
    index = (output / "index.html").read_text(encoding="utf-8")
    for name in ("locale.js", "app.js", "style.css"):
        version = hashlib.sha256((output / name).read_bytes()).hexdigest()[:12]
        index = index.replace(f'"{name}"', f'"{name}?v={version}"')
    (output / "index.html").write_text(index, encoding="utf-8")
    inbox = [read(p) for p in sorted((root / "inbox").glob("*.json"))]
    public_config = {k: cfg[k] for k in ("name", "research_topic", "description", "topics", "repository_url")}
    public_config["topic_guides"] = cfg.get("topic_guides", {})
    for key in ("subtopics", "collections", "classification_rules", "topic_aliases", "topic_descriptions", "axes", "subtopic_aliases", "translations"):
        public_config[key] = cfg.get(key, [] if key == "classification_rules" else {})
    manifest = reading_lists(root, papers, cfg)
    write(output / "data.json", {"config": public_config, "papers": sorted(papers, key=lambda p: (p["added_at"], p["id"]), reverse=True), "reading_lists": manifest, "sections": SECTIONS, "pending_count": len(inbox)})
    # Discovery indices are explicitly separate; extraction caches and drafts never enter dist.
    (output / ".nojekyll").touch()
    new_refs = [r for r in manifest["references"] if r["id"] not in {p["id"] for p in papers}]
    print(f"已构建 {len(papers)} 篇精读卡片、{len(new_refs)} 篇文献索引，{len(inbox)} 篇待处理：{output}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    prep = sub.add_parser("prepare", help="提取论文并登记待收录任务")
    prep.add_argument("--id", required=True)
    prep.add_argument("--url")
    prep.add_argument("--pdf")
    prep.add_argument("--cached-pdf", help="使用已下载的 PDF，并保留官方 --url；本地副本不作为上传附件发布")
    prep.add_argument("--update", action="store_true")
    fin = sub.add_parser("finalize", help="核验来源后收录 Codex 生成的卡片")
    fin.add_argument("--draft", required=True)
    fin.add_argument("--update", action="store_true")
    sub.add_parser("validate")
    render = sub.add_parser("render")
    render.add_argument("--check", action="store_true")
    site = sub.add_parser("build")
    site.add_argument("--output", default="dist")
    search = sub.add_parser("search")
    search.add_argument("query")
    sub.add_parser("queue")
    args = parser.parse_args()
    try:
        if args.command == "prepare":
            if not args.url and not args.pdf:
                raise Invalid("提供 --url 或 --pdf；本地 PDF 可以同时指定官方 --url。")
            prepare(args)
        elif args.command == "finalize":
            finalize(args)
        elif args.command == "validate":
            print(f"校验通过：{len(validate())} 篇论文")
        elif args.command == "render":
            render_cards(check=args.check)
        elif args.command == "build":
            build(args.output)
        elif args.command == "search":
            for p in validate():
                if args.query.casefold() in json.dumps(p, ensure_ascii=False).casefold():
                    print(f"{p['id']}\t{p['title']}\t{p['one_liner']}")
        elif args.command == "queue":
            for path in sorted((ROOT / "inbox").glob("*.json")):
                entry = read(path)
                print(entry["id"], entry["status"], entry.get("error", ""))
    except (Invalid, OSError, ValueError, KeyError, TypeError) as exc:
        print("未完成：" + str(exc), file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
