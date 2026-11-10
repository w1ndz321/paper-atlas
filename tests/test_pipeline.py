import argparse
import copy
import hashlib
import importlib.util
import json
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
        for name in ("index.html", "app.js", "style.css"):
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
        self.assertEqual({p.name for p in dest.iterdir()}, {"index.html", "app.js", "style.css", "data.json", ".nojekyll"})

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
        kb.write(self.root / "config.json", cfg)
        self.store(p)
        with patch.object(kb, "download", return_value=(self.text.encode(), "text/plain")):
            kb.prepare(argparse.Namespace(id="example", url=p["source"]["url"], pdf=None, update=True), self.root)
        draft = kb.read(self.root / ".local/example/draft.json")
        for field in ("subtopics", "collections", "classification_reason"):
            self.assertEqual(draft[field], p[field])

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


if __name__ == "__main__":
    unittest.main()
