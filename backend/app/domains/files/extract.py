"""Extracción de texto para el buscador y el indexado; las tablas se convierten en filas con cabecera."""

import csv
import io

from docx import Document
from openpyxl import load_workbook
from pypdf import PdfReader

Page = tuple[int | None, str]


def _rows_as_text(header: list[str], rows: list[list[str]]) -> str:
    lines = []
    for values in rows:
        pairs = [f"{h}: {v}" for h, v in zip(header, values, strict=False) if v]
        if pairs:
            lines.append("; ".join(pairs))
    return "\n".join(lines)


def _csv(data: bytes) -> list[Page]:
    text = data.decode("utf-8-sig", errors="replace")
    try:
        dialect: type[csv.Dialect] | csv.Dialect = csv.Sniffer().sniff(text[:2000], delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    rows = list(csv.reader(io.StringIO(text), dialect))
    return [(None, _rows_as_text(rows[0], rows[1:]))] if rows else []


def _xlsx(data: bytes) -> list[Page]:
    book = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    pages: list[Page] = []
    for sheet in book.worksheets:
        rows = [["" if c is None else str(c) for c in r] for r in sheet.iter_rows(values_only=True)]
        if rows:
            pages.append((None, f"Hoja {sheet.title}\n" + _rows_as_text(rows[0], rows[1:])))
    return pages


def extract_pages(name: str, data: bytes) -> list[Page]:
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext == "pdf":
        return [(i + 1, p.extract_text() or "") for i, p in enumerate(PdfReader(io.BytesIO(data)).pages)]
    if ext == "docx":
        document = Document(io.BytesIO(data))
        return [(None, "\n".join(p.text for p in document.paragraphs))]
    if ext == "csv":
        return _csv(data)
    if ext == "xlsx":
        return _xlsx(data)
    if ext in {"txt", "md"}:
        return [(None, data.decode("utf-8", errors="replace"))]
    return []


def extract_text(name: str, data: bytes) -> str:
    try:
        return "\n".join(text for _, text in extract_pages(name, data))
    except Exception:
        return ""
