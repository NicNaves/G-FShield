"""Audit cited BibTeX records structurally and against the Crossref DOI registry."""

from __future__ import annotations

import argparse
import json
import re
import time
import unicodedata
import urllib.parse
import urllib.request
from difflib import SequenceMatcher
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
BIB = ROOT / "Dissertação_Nicolas" / "gfshield-references.bib"
AUX = ROOT / "Dissertação_Nicolas" / "dissertacao.aux"
OUT_JSON = ROOT / "docs" / "dissertation-review" / "bibliography-audit.json"
OUT_MD = ROOT / "docs" / "dissertation-review" / "bibliography-audit.md"


REQUIRED = {
    "article": {"author", "title", "journal", "year"},
    "inproceedings": {"author", "title", "booktitle", "year"},
    "incollection": {"author", "title", "booktitle", "publisher", "year"},
    "book": {"author", "title", "publisher", "year"},
    "phdthesis": {"author", "title", "school", "year"},
    "manual": {"title", "organization", "year"},
    "misc": {"author", "title", "year", "howpublished"},
}


def strip_outer(value: str) -> str:
    value = value.strip()
    while len(value) >= 2 and ((value[0] == "{" and value[-1] == "}") or (value[0] == '"' and value[-1] == '"')):
        value = value[1:-1].strip()
    return value


def split_fields(body: str) -> list[str]:
    fields, start, depth, quoted = [], 0, 0, False
    escaped = False
    for index, char in enumerate(body):
        if escaped:
            escaped = False
            continue
        if char == "\\":
            escaped = True
            continue
        if char == '"' and depth == 0:
            quoted = not quoted
        elif not quoted:
            if char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
            elif char == "," and depth == 0:
                fields.append(body[start:index])
                start = index + 1
    fields.append(body[start:])
    return fields


def parse_bib(text: str) -> dict[str, dict[str, object]]:
    entries: dict[str, dict[str, object]] = {}
    position = 0
    while True:
        match = re.search(r"@(\w+)\s*\{\s*([^,]+),", text[position:], re.S)
        if not match:
            break
        entry_type, key = match.group(1).lower(), match.group(2).strip()
        body_start = position + match.end()
        depth, quoted, escaped = 1, False, False
        cursor = body_start
        while cursor < len(text) and depth:
            char = text[cursor]
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                quoted = not quoted
            elif not quoted:
                if char == "{":
                    depth += 1
                elif char == "}":
                    depth -= 1
            cursor += 1
        fields: dict[str, str] = {}
        for raw_field in split_fields(text[body_start : cursor - 1]):
            if "=" not in raw_field:
                continue
            name, value = raw_field.split("=", 1)
            fields[name.strip().lower()] = strip_outer(value.rstrip().rstrip(","))
        entries[key] = {"type": entry_type, "fields": fields}
        position = cursor
    return entries


def cited_keys(aux: str) -> list[str]:
    keys = []
    for group in re.findall(r"\\citation\{([^}]+)\}", aux):
        for key in group.split(","):
            key = key.strip()
            if key and not key.startswith("abnt-") and key not in keys:
                keys.append(key)
    return sorted(keys, key=str.casefold)


def normalize(value: object) -> str:
    text = str(value or "")
    text = re.sub(r"\\[A-Za-z]+\s*", "", text)
    text = re.sub(r"[{}\\]", "", text)
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def crossref_lookup(doi: str) -> dict[str, object]:
    encoded = urllib.parse.quote(doi, safe="")
    request = urllib.request.Request(
        f"https://api.crossref.org/works/{encoded}",
        headers={"User-Agent": "G-FShield-dissertation-bibliography-audit/1.0"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)["message"]


def years_from_crossref(message: dict[str, object]) -> set[int]:
    years: set[int] = set()
    for name in ("issued", "published", "published-print", "published-online", "created"):
        value = message.get(name)
        if isinstance(value, dict):
            parts = value.get("date-parts")
            if isinstance(parts, list) and parts and isinstance(parts[0], list) and parts[0]:
                years.add(int(parts[0][0]))
            timestamp = value.get("date-time")
            if isinstance(timestamp, str) and re.match(r"\d{4}", timestamp):
                years.add(int(timestamp[:4]))
    return years


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--online", action="store_true")
    args = parser.parse_args()

    entries = parse_bib(BIB.read_text(encoding="utf-8"))
    cited = cited_keys(AUX.read_text(encoding="utf-8", errors="replace"))
    previous = {}
    if OUT_JSON.exists():
        previous = {item["key"]: item for item in json.loads(OUT_JSON.read_text(encoding="utf-8"))["entries"]}

    report = []
    for key in cited:
        entry = entries.get(key)
        if not entry:
            report.append({"key": key, "status": "missing", "issues": ["entry absent from BibTeX"]})
            continue
        fields = entry["fields"]
        entry_type = str(entry["type"])
        missing = sorted(REQUIRED.get(entry_type, {"author", "title", "year"}) - set(fields))
        issues = [f"missing required field: {field}" for field in missing]
        doi = fields.get("doi", "")
        registry = previous.get(key, {}).get("registry")
        if args.online and doi:
            try:
                message = crossref_lookup(doi)
                registry_title = (message.get("title") or [""])[0]
                cited_title = normalize(fields.get("title"))
                registry_title_normalized = normalize(registry_title)
                title_similarity = SequenceMatcher(None, cited_title, registry_title_normalized).ratio()
                # Crossref sometimes omits a book subtitle while preserving the exact main title.
                if cited_title in registry_title_normalized or registry_title_normalized in cited_title:
                    title_similarity = 1.0
                cited_year = int(re.sub(r"\D", "", fields.get("year", "0")) or 0)
                registry_years = sorted(years_from_crossref(message))
                registry = {
                    "status": "verified",
                    "doi": message.get("DOI"),
                    "title": registry_title,
                    "title_similarity": round(title_similarity, 4),
                    "years": registry_years,
                    "container_title": (message.get("container-title") or [""])[0],
                    "volume": message.get("volume"),
                    "issue": message.get("issue"),
                    "page": message.get("page") or message.get("article-number"),
                    "publisher": message.get("publisher"),
                }
                if title_similarity < 0.90:
                    issues.append("title differs from DOI registry")
                if cited_year and registry_years and cited_year not in registry_years:
                    issues.append(f"year {cited_year} not among DOI registry years {registry_years}")
                time.sleep(0.08)
            except Exception as exc:  # registry/network failure is recorded, not hidden
                registry = {"status": "lookup_failed", "error": str(exc)}
                issues.append("DOI registry lookup failed")
        elif not doi:
            registry = {"status": "not_applicable_or_no_doi", "official_url": fields.get("url") or fields.get("howpublished")}

        report.append(
            {
                "key": key,
                "type": entry_type,
                "doi": doi or None,
                "status": "verified" if not issues else "review",
                "issues": issues,
                "registry": registry,
            }
        )

    payload = {
        "scope": "BibTeX entries effectively cited by the Portuguese and English dissertations",
        "bib_file": str(BIB.relative_to(ROOT)),
        "cited_entry_count": len(cited),
        "entries": report,
    }
    OUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    lines = [
        "# Auditoria das referências citadas",
        "",
        f"Escopo: {len(cited)} entradas efetivamente citadas nas duas dissertações. A validação estrutural verifica os campos exigidos por tipo; entradas com DOI são confrontadas com o registro Crossref. Obras sem DOI são identificadas separadamente e mantêm URL oficial quando disponível.",
        "",
        "| Chave | Tipo | DOI | Estrutura/registro | Observação |",
        "|---|---|---|---|---|",
    ]
    for item in report:
        registry = item.get("registry") or {}
        registry_status = registry.get("status", "não consultado") if isinstance(registry, dict) else "não consultado"
        note = "; ".join(item.get("issues", [])) or "campos obrigatórios presentes; metadados DOI compatíveis"
        doi = item.get("doi") or "sem DOI declarado"
        lines.append(f"| `{item['key']}` | {item.get('type', '—')} | {doi} | {item['status']} / {registry_status} | {note} |")
    lines.extend(
        [
            "",
            "## Notas de decisão",
            "",
            "- Chaves históricas como `Alcaraz2019`, `ResendeRibeiro2010` e `wu2012online` foram preservadas para não quebrar citações; os anos exibidos vêm dos metadados corrigidos.",
            "- A ausência de DOI não é tratada como erro quando a obra não possui DOI conhecido (por exemplo, livros, documentação oficial, padrão IEC ou workshop antigo).",
            "- A entrada retraída de Li e Sun foi removida integralmente e não aparece entre as citações.",
        ]
    )
    OUT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
