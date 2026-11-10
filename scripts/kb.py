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
        if args.pdf:
            path = Path(args.pdf)
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
        "added_at": own["added_at"] if own else str(date.today()), "updated_at": str(date.today()),
        "source": source, "read_scope": "full", "sections": {k: {"text": "", "evidence": []} for k in SECTIONS},
        "evidence": [], "related": [],
        "review": {"evidence_checked": False, "compression_checked": False, "reviewed_by": "Codex", "prompt_version": "1.1"},
    }
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
    if source:
        need(source["sha256"] == src.get("sha256"), "草稿与提取来源版本不一致")
    return errors


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
    guides = cfg.get("topic_guides", {})
    if not isinstance(guides, dict):
        errors.append("topic_guides 必须是按主题组织的对象")
    else:
        by_id = {p.get("id"): p for p in papers}
        for topic, guide in guides.items():
            if (topic not in cfg["topics"] or not isinstance(guide, dict)
                    or not isinstance(guide.get("summary"), str) or not guide["summary"].strip()
                    or not isinstance(guide.get("points"), list)
                    or not all(isinstance(x, str) and x.strip() for x in guide["points"])
                    or not isinstance(guide.get("reading_order"), list)):
                errors.append(f"{topic}: 主题导读缺少有效内容")
                continue
            for item in guide["reading_order"]:
                if (not isinstance(item, dict) or not isinstance(item.get("label"), str) or not item["label"].strip()
                        or not isinstance(item.get("id"), str)
                        or item.get("id") not in by_id or topic not in by_id[item["id"]].get("topics", [])):
                    errors.append(f"{topic}: 推荐阅读必须指向本主题已收录的论文")
    if errors:
        raise Invalid("\n".join(errors))
    return papers


def markdown(p, cfg):
    src = p["source"]["url"] or "../" + p["source"]["attachment"]
    out = [f"# {p['title']}", "", p["one_liner"], "", f"- 作者：{', '.join(p['authors'])}",
           f"- 年份：{p['year']} · 类型：{p['paper_type']}", f"- 主题：{' / '.join(cfg['topics'][x] for x in p['topics'])}",
           f"- [原文]({src}) · 收录：{p['added_at']} · 更新：{p['updated_at']}", ""]
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
    for name in ("index.html", "app.js", "style.css"):
        shutil.copyfile(root / "web" / name, output / name)
    inbox = [read(p) for p in sorted((root / "inbox").glob("*.json"))]
    public_config = {k: cfg[k] for k in ("name", "research_topic", "description", "topics", "repository_url")}
    public_config["topic_guides"] = cfg.get("topic_guides", {})
    write(output / "data.json", {"config": public_config, "papers": sorted(papers, key=lambda p: (p["added_at"], p["id"]), reverse=True), "sections": SECTIONS, "pending_count": len(inbox)})
    # Only website assets and reviewed cards are published; extraction caches/drafts never enter dist.
    (output / ".nojekyll").touch()
    print(f"已构建 {len(papers)} 篇论文，{len(inbox)} 篇待处理：{output}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    prep = sub.add_parser("prepare", help="提取论文并登记待收录任务")
    prep.add_argument("--id", required=True)
    prep.add_argument("--url")
    prep.add_argument("--pdf")
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
