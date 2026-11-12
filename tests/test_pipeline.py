import argparse
import copy
import hashlib
import importlib.util
import json
import shutil
import subprocess
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("kb", Path(__file__).parents[1] / "scripts" / "kb.py")
kb = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(kb)


class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.cfg = {"name": "Test", "research_topic": "Agent Benchmark", "description": "测试", "repository_url": "https://github.com/test/library", "topics": {"general-agents": "通用 Agent 评测"}}
        kb.write(self.root / "config.json", self.cfg)
        for directory in ("papers", "web", "cards", "inbox"):
            (self.root / directory).mkdir()
        for name in ("index.html", "locale.js", "app.js", "style.css"):
            (self.root / "web" / name).write_text("test", encoding="utf-8")
        self.text = "The benchmark measures task success and reports tool execution results. " * 18
        self.digest = hashlib.sha256(self.text.encode()).hexdigest()
        self.source = {"sha256": self.digest, "pages": [{"page": 1, "text": self.text}]}

    def paper(self, paper_id="example"):
        return {
            "schema_version": 1, "id": paper_id, "title": "Agent Benchmark", "authors": ["A. Author"],
            "year": 2024, "paper_type": "method", "topics": ["general-agents"], "tags": ["任务评测"],
            "one_liner": "该基准通过自动检查器评估任务完成情况并报告执行结果。", "added_at": "2026-01-01", "updated_at": "2026-01-01",
            "source": {"url": "https://arxiv.org/abs/2401.00001v1", "sha256": self.digest, "format": "text", "page_count": 1, "attachment": ""},
            "read_scope": "full", "sections": {key: {"text": "通过最终任务评测任务目标，并容忍不同的操作路径；此处为代表性测试输入。", "evidence": ["e1"]} for key in kb.SECTIONS},
            "evidence": [{"id": "e1", "page": 1, "locator": "Method", "quote": "measures task success"}, {"id": "e2", "page": 1, "locator": "Results", "quote": "tool execution results"}, {"id": "e3", "page": 1, "locator": "Limitations", "quote": "The benchmark measures"}],
            "related": [], "review": {"evidence_checked": True, "compression_checked": True, "reviewed_by": "Codex", "prompt_version": "1.1", "evidence_verified_sha256": self.digest}}

    def store(self, paper):
        kb.write(self.root / "papers" / (paper["id"] + ".json"), paper)

    def test_full_finalize_preserves_evidence_and_generates_readable_card(self):
        p = self.paper()
        kb.write(self.root / ".local/example/source.json", self.source)
        kb.write(self.root / ".local/example/draft.json", p)
        kb.write(self.root / "inbox/example.json", {"status": "awaiting_summary"})
        kb.finalize(argparse.Namespace(draft=self.root / ".local/example/draft.json", update=False), self.root)
        result = kb.read(self.root / "papers/example.json")
        self.assertEqual(result["review"]["evidence_verified_sha256"], self.digest)
        self.assertFalse((self.root / "inbox/example.json").exists())
        self.assertIn("tool execution results", (self.root / "cards/example.md").read_text())
        self.assertEqual(len(kb.validate(self.root)), 1)

    def test_invented_or_wrong_page_evidence_cannot_publish(self):
        for change in (lambda p: p["evidence"][0].update(quote="invented quotation"), lambda p: p["evidence"][0].update(page=2)):
            p = self.paper()
            change(p)
            kb.write(self.root / ".local/example/source.json", self.source)
            kb.write(self.root / ".local/example/draft.json", p)
            with self.assertRaises(kb.Invalid):
                kb.finalize(argparse.Namespace(draft=self.root / ".local/example/draft.json", update=False), self.root)
            self.assertFalse((self.root / "papers/example.json").exists())

    def test_incomplete_or_unreviewed_cards_fail(self):
        for mutation in (
            lambda p: p.update(read_scope="abstract"),
            lambda p: p["sections"].pop("limitations"),
            lambda p: p["review"].update(evidence_checked=False),
            lambda p: p.update(topics=["invented-topic"]),
            lambda p: p["sections"]["results"].update(evidence=["missing"]),
            lambda p: p["related"].append({"id": "not-in-library", "reason": "related"}),
            lambda p: p["review"].pop("evidence_verified_sha256"),
        ):
            p = self.paper()
            mutation(p)
            self.assertTrue(kb.check_record(p, self.cfg, {"example"}, self.root))

    def test_source_version_mismatch_fails(self):
        p = self.paper()
        src = copy.deepcopy(self.source)
        src["sha256"] = "0" * 64
        self.assertIn("草稿与提取来源版本不一致", kb.check_record(p, self.cfg, {"example"}, self.root, src))

    def test_arxiv_versions_are_same_identity(self):
        self.assertEqual(kb.identity("https://arxiv.org/abs/2401.00001v1"), kb.identity("https://arxiv.org/pdf/2401.00001v3"))
        self.store(self.paper())
        p = self.paper("duplicate")
        p["source"]["url"] = "https://arxiv.org/pdf/2401.00001v3"
        self.store(p)
        with self.assertRaises(kb.Invalid):
            kb.validate(self.root)

    def test_revision_requires_update_and_preserves_first_added(self):
        p = self.paper()
        self.store(p)
        p["added_at"] = "2026-09-01"
        p["sections"]["method"]["text"] = "这里是修订后的方法说明，同时保留论文的关键机制与证据。"
        kb.write(self.root / ".local/example/source.json", self.source)
        draft = self.root / ".local/example/draft.json"
        kb.write(draft, p)
        with self.assertRaises(kb.Invalid):
            kb.finalize(argparse.Namespace(draft=draft, update=False), self.root)
        kb.finalize(argparse.Namespace(draft=draft, update=True), self.root)
        self.assertEqual(kb.read(self.root / "papers/example.json")["added_at"], "2026-01-01")

    def test_failed_extraction_leaves_visible_queue(self):
        with patch.object(kb, "download", return_value=(b"only an abstract", "text/plain")):
            with self.assertRaises(kb.Invalid):
                kb.prepare(argparse.Namespace(id="short-paper", url="https://example.org/paper", pdf=None, update=False), self.root)
        self.assertEqual(kb.read(self.root / "inbox/short-paper.json")["status"], "needs_source")
        self.assertFalse((self.root / "papers/short-paper.json").exists())

    def test_successful_preparation_creates_draft_not_published_record(self):
        with patch.object(kb, "download", return_value=(self.text.encode(), "text/plain")):
            kb.prepare(argparse.Namespace(id="example", url="https://example.org/paper", pdf=None, update=False), self.root)
        self.assertTrue((self.root / ".local/example/draft.json").is_file())
        self.assertEqual(kb.read(self.root / "inbox/example.json")["status"], "awaiting_summary")
        self.assertEqual(kb.records(self.root), [])

    def test_scanned_pdf_is_not_summarized_as_fulltext(self):
        import io
        from pypdf import PdfWriter
        writer = PdfWriter()
        writer.add_blank_page(width=612, height=792)
        buffer = io.BytesIO()
        writer.write(buffer)
        with self.assertRaisesRegex(kb.Invalid, "扫描件"):
            kb.extract(buffer.getvalue())

    def test_downloaded_pdf_is_cached_without_publishing_an_attachment(self):
        binary = b"%PDF-1.4 downloaded test source"
        with patch.object(kb, "download", return_value=(binary, "application/pdf")), \
             patch.object(kb, "extract", return_value=("pdf", self.source["pages"])):
            kb.prepare(argparse.Namespace(id="downloaded", url="https://example.org/paper.pdf", pdf=None, update=False), self.root)
        self.assertEqual((self.root / "pdfs/downloaded.pdf").read_bytes(), binary)
        source = kb.read(self.root / ".local/downloaded/source.json")
        self.assertEqual(source["attachment"], "")
        self.assertFalse((self.root / "attachments/downloaded.pdf").exists())
        manifest = kb.read(self.root / "pdfs/manifest.json")
        self.assertEqual(manifest["downloaded"]["sha256"], source["sha256"])
        self.assertEqual(kb.records(self.root), [])

    def test_cached_pdf_reuses_official_url_without_network_or_upload(self):
        binary = b"%PDF-1.4 cached test source"
        path = self.root / "cached.pdf"
        path.write_bytes(binary)
        with patch.object(kb, "download", side_effect=AssertionError("must not download again")), \
             patch.object(kb, "extract", return_value=("pdf", self.source["pages"])):
            kb.prepare(argparse.Namespace(id="cached", url="https://example.org/paper.pdf", pdf=None, cached_pdf=path, update=False), self.root)
        source = kb.read(self.root / ".local/cached/source.json")
        self.assertEqual(source["url"], "https://example.org/paper.pdf")
        self.assertEqual(source["attachment"], "")

    def test_uploaded_pdf_archived_with_page_evidence(self):
        from pypdf import PdfWriter
        from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject
        writer = PdfWriter()
        page = writer.add_blank_page(width=612, height=792)
        font = DictionaryObject({NameObject('/Type'): NameObject('/Font'), NameObject('/Subtype'): NameObject('/Type1'), NameObject('/BaseFont'): NameObject('/Helvetica')})
        page[NameObject('/Resources')] = DictionaryObject({NameObject('/Font'): DictionaryObject({NameObject('/F1'): writer._add_object(font)})})
        stream = DecodedStreamObject()
        lines = ['BT /F1 10 Tf 40 740 Td'] + ['(The benchmark measures task success and reports tool execution results.) Tj 0 -14 Td'] * 20 + ['ET']
        stream.set_data('\n'.join(lines).encode())
        page[NameObject('/Contents')] = writer._add_object(stream)
        pdf = self.root / 'upload.pdf'
        writer.write(pdf)
        kb.prepare(argparse.Namespace(id='uploaded', url=None, pdf=str(pdf), update=False), self.root)
        source = kb.read(self.root / '.local/uploaded/source.json')
        self.assertEqual(source['attachment'], 'attachments/uploaded.pdf')
        self.assertEqual((self.root / source['attachment']).read_bytes(), pdf.read_bytes())
        p = self.paper('uploaded')
        p['source'] = {k:v for k,v in source.items() if k != 'pages'}
        p['review']['evidence_verified_sha256'] = source['sha256']
        kb.write(self.root / '.local/uploaded/draft.json', p)
        kb.finalize(argparse.Namespace(draft=self.root / '.local/uploaded/draft.json', update=False), self.root)
        self.assertEqual(kb.validate(self.root)[0]['id'], 'uploaded')

    def test_build_excludes_drafts_and_fulltext(self):
        self.store(self.paper())
        kb.write(self.root / ".local/private.json", {"secret": "do-not-publish"})
        kb.render_cards(self.root)
        dest = self.root / "dist"
        kb.build(dest, self.root)
        output = kb.read(dest / "data.json")
        self.assertEqual(output["papers"][0]["id"], "example")
        self.assertNotIn("do-not-publish", (dest / "data.json").read_text())
        self.assertEqual({p.name for p in dest.iterdir()}, {"index.html", "locale.js", "app.js", "style.css", "data.json", ".nojekyll"})

    def reference(self):
        return {"id": "reading-entry", "title": "A source-checked paper", "authors": ["A. Author"],
                "year": 2024, "paper_type": "method", "source_url": "https://arxiv.org/abs/2401.00002",
                "source_basis": "abstract", "verified_at": "2026-01-01", "one_liner": "官方摘要中的研究简介。",
                "one_liner_en": "An introduction based on the official abstract.", "context": "本主题的方法背景。",
                "context_en": "Methodological background for this topic."}

    def test_discovery_entries_publish_separately_from_full_text_cards(self):
        self.store(self.paper())
        manifest = {"schema_version": 1, "lists": {"general-agents": ["example", "reading-entry"]},
                    "references": [self.reference()]}
        kb.write(self.root / "reading_lists.json", manifest)
        kb.render_cards(self.root)
        kb.build(self.root / "dist", self.root)
        data = kb.read(self.root / "dist/data.json")
        self.assertEqual(len(data["papers"]), 1)
        self.assertEqual(data["reading_lists"], manifest)
        self.assertFalse((self.root / "cards/reading-entry.md").exists())

    def test_discovery_entries_reject_broken_or_ambiguous_sources(self):
        self.store(self.paper())
        base = {"schema_version": 1, "lists": {"general-agents": ["reading-entry"]},
                "references": [self.reference()]}
        for mutate in (
            lambda m: m["references"][0].update(source_url="javascript:alert(1)"),
            lambda m: m["references"][0].update(source_url="https://arxiv.org/pdf/2401.00001v2"),
            lambda m: m["references"][0].update(one_liner_en=""),
            lambda m: m["references"][0].update(verified_at="2099-01-01"),
            lambda m: m["lists"]["general-agents"].append("missing-entry"),
            lambda m: m["lists"]["general-agents"].append("reading-entry"),
        ):
            manifest = copy.deepcopy(base)
            mutate(manifest)
            kb.write(self.root / "reading_lists.json", manifest)
            with self.assertRaises(kb.Invalid):
                kb.validate(self.root)

    def test_full_text_ingestion_preserves_discovery_identity(self):
        ref = self.reference()
        ref.update(id="example", source_url="https://arxiv.org/abs/2401.00001v2")
        self.store(self.paper())
        kb.write(self.root / "reading_lists.json", {"schema_version": 1,
                 "lists": {"general-agents": ["example"]}, "references": [ref]})
        self.assertEqual(len(kb.validate(self.root)), 1)

    def test_repository_seed_lists_have_twenty_distinct_resolvable_entries(self):
        root = Path(__file__).parents[1]
        manifest = kb.reading_lists(root, kb.records(root), kb.config(root))
        self.assertEqual(set(manifest["lists"]), {"agent-benchmarks", "rsi", "llm-interpretability", "interpretability-rsi"})
        for ids in manifest["lists"].values():
            self.assertEqual(len(set(ids)), 20)

    def test_generated_cards_drift_detected(self):
        self.store(self.paper())
        kb.render_cards(self.root)
        (self.root / "cards/example.md").write_text("manual edit")
        with self.assertRaises(kb.Invalid):
            kb.render_cards(self.root, check=True)

    def test_topic_reading_links_require_published_paper_in_same_topic(self):
        self.store(self.paper())
        guide = {"summary": "研究脉络", "points": ["研究边界"], "reading_order": [{"id": "example", "label": "Read"}]}
        cfg = copy.deepcopy(self.cfg)
        cfg["topics"]["other-topic"] = "其他主题"
        for topic, paper_id in (("general-agents", "missing"), ("other-topic", "example"), ("general-agents", [])):
            bad = copy.deepcopy(guide)
            bad["reading_order"][0]["id"] = paper_id
            cfg["topic_guides"] = {topic: bad}
            kb.write(self.root / "config.json", cfg)
            with self.assertRaisesRegex(kb.Invalid, "推荐阅读"):
                kb.validate(self.root)

    def test_topic_guides_are_published_with_valid_reading_links(self):
        self.store(self.paper())
        guides = {"general-agents": {"summary": "研究脉络", "points": ["研究边界"], "reading_order": [{"id": "example", "label": "Read"}]}}
        cfg = {**self.cfg, "topic_guides": guides}
        kb.write(self.root / "config.json", cfg)
        kb.render_cards(self.root)
        kb.build(self.root / "dist", self.root)
        self.assertEqual(kb.read(self.root / "dist/data.json")["config"]["topic_guides"], guides)

    def test_path_traversal_and_unsafe_urls_rejected(self):
        self.assertFalse(kb.slug_ok("../../outside"))
        self.assertFalse(kb.safe_url("javascript:alert(1)"))
        self.assertFalse(kb.safe_url("https://user:password@example.org"))
        p = self.paper()
        p["source"]["attachment"] = "../../outside.pdf"
        self.assertTrue(kb.check_record(p, self.cfg, {"example"}, self.root))

    def taxonomy(self):
        cfg = copy.deepcopy(self.cfg)
        cfg["topics"]["other-topic"] = "其他主题"
        cfg["subtopics"] = {
            "task-program": {"topic": "general-agents", "label": "任务程序", "definition": "按直接改进的程序对象分类"},
            "other-object": {"topic": "other-topic", "label": "其他对象", "definition": "另一父主题下的研究对象"},
        }
        cfg["collections"] = {"cross-view": {"label": "交叉入口", "summary": "独立的交叉阅读入口", "points": ["需要实际连接证据"], "reading_order": [{"id": "example", "label": "Example"}]}}
        p = self.paper()
        p.update(subtopics=["task-program"], collections=["cross-view"], classification_reason="直接研究任务程序及其评价，按实际研究对象归类。")
        return cfg, p

    def test_taxonomy_rejects_orphan_duplicate_unknown_and_missing_assignments(self):
        cfg, p = self.taxonomy()
        for change in (
            lambda x: x.update(subtopics=["other-object"]),
            lambda x: x.update(subtopics=["task-program", "task-program"]),
            lambda x: x.update(subtopics=["unknown"]),
            lambda x: x.update(subtopics=[]),
            lambda x: x.update(collections=["unknown"]),
            lambda x: x.update(collections=["cross-view", "cross-view"]),
            lambda x: x.update(classification_reason=""),
            lambda x: x.update(topics=["cross-view"]),
        ):
            bad = copy.deepcopy(p)
            change(bad)
            with self.subTest(paper=bad):
                self.assertTrue(kb.check_record(bad, cfg, {"example"}, self.root))

    def test_taxonomy_boundaries_and_cross_collection_reach_published_card(self):
        cfg, p = self.taxonomy()
        kb.write(self.root / "config.json", cfg)
        self.store(p)
        kb.render_cards(self.root)
        kb.build(self.root / "dist", self.root)
        published = kb.read(self.root / "dist/data.json")
        self.assertEqual(published["config"]["subtopics"], cfg["subtopics"])
        self.assertNotIn("cross-view", published["config"]["topics"])
        self.assertEqual(published["papers"][0]["collections"], ["cross-view"])
        markdown = (self.root / "cards/example.md").read_text()
        self.assertIn("归类依据（知识库分析）", markdown)
        self.assertIn("子类：任务程序", markdown)
        # A recommended cross-entry link cannot point to a nonmember.
        p["collections"] = []
        self.store(p)
        with self.assertRaisesRegex(kb.Invalid, "推荐阅读"):
            kb.validate(self.root)

    def test_taxonomy_config_rejects_invalid_parent_and_mixed_entry(self):
        cfg, _ = self.taxonomy()
        cfg["subtopics"]["task-program"]["topic"] = "missing"
        kb.write(self.root / "config.json", cfg)
        with self.assertRaisesRegex(kb.Invalid, "父主题"):
            kb.config(self.root)
        cfg, _ = self.taxonomy()
        cfg["topics"]["cross-view"] = "交叉入口"
        kb.write(self.root / "config.json", cfg)
        with self.assertRaisesRegex(kb.Invalid, "交叉入口"):
            kb.config(self.root)

    def test_prepare_update_preserves_classification_metadata(self):
        cfg, p = self.taxonomy()
        p["rsi_evidence"] = {"status": "待核验的测试状态", "next_round_role": "演化后的程序实际承担后续修改。"}
        kb.write(self.root / "config.json", cfg)
        self.store(p)
        with patch.object(kb, "download", return_value=(self.text.encode(), "text/plain")):
            kb.prepare(argparse.Namespace(id="example", url=p["source"]["url"], pdf=None, update=True), self.root)
        draft = kb.read(self.root / ".local/example/draft.json")
        for field in ("subtopics", "collections", "classification_reason", "rsi_evidence"):
            self.assertEqual(draft[field], p[field])

    def test_each_applicable_dimension_requires_a_label(self):
        cfg, p = self.taxonomy()
        cfg["axes"] = {
            "target": {"topic": "general-agents", "label": "对象", "question": "研究哪个对象？"},
            "method": {"topic": "general-agents", "label": "方法", "question": "采用什么方法？"},
            "other": {"topic": "other-topic", "label": "其他", "question": "其他对象是什么？"},
        }
        cfg["subtopics"]["task-program"]["axis"] = "target"
        cfg["subtopics"]["other-object"]["axis"] = "other"
        cfg["subtopics"]["method-label"] = {"topic": "general-agents", "axis": "method", "label": "干预", "definition": "根据干预验证"}
        self.assertIn("method 缺少维度标签", kb.check_record(p, cfg, {"example"}, self.root))
        p["subtopics"].append("method-label")
        self.assertEqual([], kb.check_record(p, cfg, {"example"}, self.root))
        kb.write(self.root / "config.json", cfg)
        self.store(p)
        kb.render_cards(self.root)
        kb.build(self.root / "dist", self.root)
        self.assertEqual(cfg["axes"], kb.read(self.root / "dist/data.json")["config"]["axes"])
        cfg["subtopics"]["task-program"]["axis"] = "other"
        kb.write(self.root / "config.json", cfg)
        with self.assertRaisesRegex(kb.Invalid, "分类维度"):
            kb.config(self.root)

    def test_question_entry_cannot_open_another_topics_dimension(self):
        cfg, p = self.taxonomy()
        cfg["axes"] = {"first": {"topic": "general-agents", "label": "第一", "question": "第一问题？"}, "second": {"topic": "other-topic", "label": "第二", "question": "第二问题？"}}
        cfg["subtopics"]["task-program"]["axis"] = "first"
        cfg["subtopics"]["other-object"]["axis"] = "second"
        cfg["topic_guides"] = {"general-agents": {"summary": "根据问题进入分类", "points": [], "reading_order": [], "questions": [{"question": "研究哪个问题？", "label": "查看", "axis": "second"}]}}
        self.store(p)
        kb.write(self.root / "config.json", cfg)
        with self.assertRaisesRegex(kb.Invalid, "问题入口"):
            kb.validate(self.root)
        cfg["topic_guides"]["general-agents"]["questions"][0]["axis"] = "first"
        kb.write(self.root / "config.json", cfg)
        kb.validate(self.root)

    def test_rsi_needs_next_round_role_and_separate_capability_evidence(self):
        cfg = copy.deepcopy(self.cfg)
        cfg["topics"]["rsi"] = "RSI"
        cfg["axes"] = {"recursion": {"topic": "rsi", "label": "递归机制", "question": "谁承担下一轮改进？"}}
        cfg["subtopics"] = {"recursive-agent": {"topic": "rsi", "axis": "recursion", "label": "递归 Agent", "definition": "演化后 Agent 承担后续自修改"}}
        p = self.paper()
        p.update(topics=["rsi"], subtopics=["recursive-agent"], classification_reason="演化后的 Agent 承担下一轮自修改，但能力增益须单独检验。")
        self.assertTrue(kb.check_record(p, cfg, {"example"}, self.root))
        p["rsi_evidence"] = {"status": "结构闭环已有证据", "next_round_role": "演化后的 Agent 实际生成后续修改。", "fixed_components": "底座模型与外部评价协议保持固定。", "capability_evidence": "只有任务分数，尚无独立改进效率证据。"}
        self.assertEqual([], kb.check_record(p, cfg, {"example"}, self.root))
        kb.write(self.root / "config.json", cfg)
        self.store(p)
        kb.render_cards(self.root)
        self.assertIn(p["rsi_evidence"]["capability_evidence"], (self.root / "cards/example.md").read_text())

    def test_research_topics_have_simplified_flat_subtopics(self):
        cfg = kb.config()
        self.assertEqual({}, cfg["axes"])
        self.assertEqual(3, sum(s["topic"] == "agent-benchmarks" for s in cfg["subtopics"].values()))
        self.assertEqual(3, sum(s["topic"] == "rsi" for s in cfg["subtopics"].values()))
        self.assertEqual(4, sum(s["topic"] == "llm-interpretability" for s in cfg["subtopics"].values()))
        self.assertFalse(any(s["topic"] == "interest-exploration" for s in cfg["subtopics"].values()))

    @unittest.skipUnless(shutil.which("node"), "需要 Node 验证读者页面筛选逻辑")
    def test_unclassified_entries_remain_reachable(self):
        program = r"""
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync(process.argv[1], 'utf8').replace(/\ninit\(\);\s*$/, '');
const {addPendingCategories} = vm.runInNewContext(source + '\n;({addPendingCategories})', {URLSearchParams, location:{search:''}});
const cfg = JSON.parse(fs.readFileSync(0,'utf8'));
const entries = [
  {id:'reviewed', topics:['rsi'], subtopics:['rsi-rec-background']},
  {id:'reference', topics:['rsi','llm-interpretability'], subtopics:[]},
  {id:'outside', topics:['interest-exploration'], subtopics:[]},
];
addPendingCategories(entries,cfg,'zh');
assert.equal(entries[0].subtopics.length,1);
assert.equal(entries[1].subtopics.length,2);
assert.equal(entries[2].subtopics.length,0);
assert.equal(cfg.subtopics['pending-rsi'].label,'待核对分类');
assert.equal(cfg.subtopics['pending-rsi'].pending,true);
assert.ok(!cfg.subtopics['pending-agent-benchmarks']);
addPendingCategories(entries,cfg,'zh');
assert.equal(entries[1].subtopics.length,2);
"""
        subprocess.run(["node", "-e", program, str(kb.ROOT / "web/app.js")], input=json.dumps(kb.config()), text=True, capture_output=True, check=True)

    @unittest.skipUnless(shutil.which("node"), "需要 Node 验证读者页面筛选逻辑")
    def test_reader_navigates_one_category_and_migrates_old_links(self):
        program = r"""
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync(process.argv[1], 'utf8').replace(/\ninit\(\);\s*$/, '');
const api = vm.runInNewContext(source + '\n;({ setData: value => data=value, matchesCategory, readView, getView:()=>({topic,subtopic,collection,guideOpen}) })', { URL, URLSearchParams, location:{search:''} });
const data = JSON.parse(fs.readFileSync(0,'utf8')); api.setData(data);
api.readView(new URLSearchParams('topic=rsi'));
assert.equal(api.getView().guideOpen,true);
api.readView(new URLSearchParams('topic=rsi&view=works'));
assert.equal(api.getView().guideOpen,false);
api.readView(new URLSearchParams('topic=rsi&q=optimizer'));
assert.equal(api.getView().guideOpen,false);
api.readView(new URLSearchParams('topic=interest-exploration'));
assert.equal(api.getView().guideOpen,false);
assert.ok(data.papers.filter(p=>api.matchesCategory(p,'interp-features')).some(p=>p.id==='rome'));
assert.ok(data.papers.filter(p=>api.matchesCategory(p,'interp-features')).some(p=>p.id==='scaling-monosemanticity'));
api.readView(new URLSearchParams('topic=agent-benchmarks&subtopic=domain-physics&subtopic=domain-earth'));
assert.equal(api.getView().subtopic,'eval-science-domain');
assert.ok(data.papers.filter(p=>api.matchesCategory(p)).some(p=>p.id==='scienceagentbench'));
assert.ok(!data.papers.filter(p=>api.matchesCategory(p)).some(p=>p.id==='dont-pass-at-k'));
api.readView(new URLSearchParams('topic=agent-benchmarks&subtopic=eval-metrics'));
assert.equal(api.getView().subtopic,'eval-validity');
assert.ok(data.papers.filter(p=>api.matchesCategory(p)).some(p=>p.id==='dont-pass-at-k'));
api.readView(new URLSearchParams('topic=rsi-interpretability&subtopic=interp-representations'));
assert.equal(api.getView().topic,'llm-interpretability');
assert.equal(api.getView().subtopic,'interp-features');
assert.equal(api.getView().guideOpen,false);
api.readView(new URLSearchParams('topic=rsi&subtopic=rsi-agent-programs'));
assert.equal(api.getView().subtopic,'rsi-rec-agent');
api.readView(new URLSearchParams('topic=interpretability-rsi'));
assert.equal(api.getView().collection,'interpretability-rsi');
api.readView(new URLSearchParams('topic=rsi&subtopic=unknown&subtopic=interp-representations'));
assert.equal(api.getView().subtopic,'');
"""
        subprocess.run(["node", "-e", program, str(kb.ROOT / "web/app.js")], input=json.dumps({"config": kb.config(), "papers": kb.records()}), text=True, capture_output=True, check=True)

    def test_cross_collection_is_scoped_to_its_parent_topic(self):
        cfg, p = self.taxonomy()
        cfg["collections"]["cross-view"]["topic"] = "other-topic"
        self.assertIn("交叉入口与父主题不一致", kb.check_record(p, cfg, {"example"}, self.root))
        cfg["collections"]["cross-view"]["topic"] = "missing"
        kb.write(self.root / "config.json", cfg)
        with self.assertRaisesRegex(kb.Invalid, "有效主主题"):
            kb.config(self.root)

    def test_topic_aliases_publish_and_must_target_existing_topic(self):
        cfg, p = self.taxonomy()
        cfg["topic_aliases"] = {"former-topic": "general-agents"}
        cfg["subtopics"]["task-program"]["group"] = "研究对象"
        kb.write(self.root / "config.json", cfg)
        self.store(p)
        kb.render_cards(self.root)
        kb.build(self.root / "dist", self.root)
        published = kb.read(self.root / "dist/data.json")["config"]
        self.assertEqual(published["topic_aliases"], cfg["topic_aliases"])
        self.assertEqual(published["subtopics"]["task-program"]["group"], "研究对象")
        for invalid in ("missing", []):
            cfg["topic_aliases"]["former-topic"] = invalid
            kb.write(self.root / "config.json", cfg)
            with self.assertRaisesRegex(kb.Invalid, "旧链接"):
                kb.config(self.root)

    def test_build_refuses_source_directory(self):
        with self.assertRaises(kb.Invalid):
            kb.build(self.root, self.root)

    def test_empty_library_builds(self):
        kb.render_cards(self.root)
        kb.build(self.root / "dist", self.root)
        self.assertEqual(kb.read(self.root / "dist/data.json")["papers"], [])

    def test_build_changes_asset_urls_when_reader_changes(self):
        (self.root / "web/index.html").write_text('<link href="style.css"><script src="locale.js"></script><script src="app.js"></script>')
        kb.render_cards(self.root)
        kb.build(self.root / "dist", self.root)
        first = (self.root / "dist/index.html").read_text()
        self.assertIn('app.js?v=', first)
        self.assertIn('style.css?v=', first)
        self.assertIn('locale.js?v=', first)
        (self.root / "web/app.js").write_text('updated reader')
        kb.build(self.root / "dist", self.root)
        second = (self.root / "dist/index.html").read_text()
        self.assertNotEqual(first, second)
        expected = hashlib.sha256(b'updated reader').hexdigest()[:12]
        self.assertIn('app.js?v=' + expected, second)
        (self.root / "web/locale.js").write_text('updated translations')
        kb.build(self.root / "dist", self.root)
        third = (self.root / "dist/index.html").read_text()
        self.assertNotEqual(second, third)

    def test_english_card_preserves_source_and_reference_ids(self):
        p = self.paper()
        p['translations'] = {'en': {
            'source_sha256': self.digest,
            'one_liner': 'This benchmark checks task completion using executable tests.',
            'sections': {key: 'A complete English explanation of the corresponding section.' for key in kb.SECTIONS},
            'locators': {e['id']: e['locator'] for e in p['evidence']},
            'related': {},
        }}
        self.store(p)
        self.assertEqual(1, len(kb.validate(self.root)))
        for field, value in [('source_sha256', '0' * 64), ('sections', {}), ('locators', {}), ('related', {'missing': 'Wrong reference'})]:
            with self.subTest(field=field):
                invalid = copy.deepcopy(p)
                invalid['translations']['en'][field] = value
                self.store(invalid)
                with self.assertRaises(kb.Invalid):
                    kb.validate(self.root)

    @unittest.skipUnless(shutil.which("node"), "需要 Node 验证中英文切换")
    def test_localization_handles_both_languages_and_older_records(self):
        program = r"""
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const api = vm.runInNewContext(fs.readFileSync(process.argv[1], 'utf8') + '\n;({localizeData,preferredLanguage})', {URLSearchParams});
const data = JSON.parse(fs.readFileSync(0,'utf8'));
const snapshot = JSON.stringify(data);
const english = api.localizeData(data,'en');
assert.equal(english.config.topics.rsi,'Recursive self-improvement');
assert.equal(english.sections.method,'How it works');
for (const paper of english.papers) {
  const original = data.papers.find(p=>p.id===paper.id);
  assert.equal(paper.one_liner,original.translations.en.one_liner);
  for(const [key,section] of Object.entries(paper.sections)) {
    assert.equal(section.text,original.translations.en.sections[key]);
    assert.equal(JSON.stringify(section.evidence),JSON.stringify(original.sections[key].evidence));
  }
  assert.equal(JSON.stringify(paper.source),JSON.stringify(original.source));
}
assert.equal(JSON.stringify(data),snapshot);
assert.equal(JSON.stringify(api.localizeData(data,'zh')),snapshot);
const old = JSON.parse(snapshot);
delete old.papers[0].translations;
assert.equal(api.localizeData(old,'en').papers[0].one_liner,old.papers[0].one_liner);
old.papers[1].translations.en.source_sha256='outdated';
assert.equal(api.localizeData(old,'en').papers[1].one_liner,old.papers[1].one_liner);
const saved={getItem:()=> 'en'};
assert.equal(api.preferredLanguage('',saved),'en');
assert.equal(api.preferredLanguage('?lang=zh',saved),'zh');
assert.equal(api.preferredLanguage('?lang=en',{getItem:()=> 'zh'}),'en');
assert.equal(api.preferredLanguage('?lang=bad',{getItem:()=>{throw Error('denied')}}),'zh');
"""
        subprocess.run(["node", "-e", program, str(kb.ROOT / "web/locale.js")],
                       input=json.dumps({"config": kb.config(), "papers": kb.records(), "sections": kb.SECTIONS}),
                       text=True, capture_output=True, check=True)


if __name__ == "__main__":
    unittest.main()
