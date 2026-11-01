"""Troceado: ~500 tokens con 50 de solapamiento, respetando títulos y páginas."""

import re
from dataclasses import dataclass

CHARS_PER_TOKEN = 4
CHUNK_CHARS = 500 * CHARS_PER_TOKEN
OVERLAP_CHARS = 50 * CHARS_PER_TOKEN
HEADING = re.compile(r"^(#{1,6}\s+.+|[A-ZÁÉÍÓÚÑ0-9][^\n.]{0,70}:?)$")


@dataclass
class Chunk:
    content: str
    page: int | None
    heading: str


def estimate_tokens(text: str) -> int:
    return max(1, len(text) // CHARS_PER_TOKEN)


def _pieces(text: str) -> list[str]:
    pieces: list[str] = []
    for block in re.split(r"\n\s*\n", text):
        block = block.strip()
        while len(block) > CHUNK_CHARS:
            cut = block.rfind(" ", 0, CHUNK_CHARS)
            cut = cut if cut > CHUNK_CHARS // 2 else CHUNK_CHARS
            pieces.append(block[:cut])
            block = block[cut:].strip()
        if block:
            pieces.append(block)
    return pieces


def chunk_pages(pages: list[tuple[int | None, str]]) -> list[Chunk]:
    chunks: list[Chunk] = []
    heading = ""
    for page, text in pages:
        buffer = ""
        for piece in _pieces(text):
            first_line = piece.split("\n", 1)[0].strip()
            if len(first_line) < 80 and HEADING.match(first_line):
                heading = first_line.lstrip("# ")
            if buffer and len(buffer) + len(piece) + 2 > CHUNK_CHARS:
                chunks.append(Chunk(buffer, page, heading))
                buffer = buffer[-OVERLAP_CHARS:]
                space = buffer.find(" ")
                buffer = buffer[space + 1 :] if space >= 0 else buffer
            buffer = f"{buffer}\n\n{piece}" if buffer else piece
        if buffer.strip():
            chunks.append(Chunk(buffer, page, heading))
    return chunks
