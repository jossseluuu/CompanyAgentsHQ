"""RNF-ESC-02 y RNF-ESC-04: los límites entre módulos se comprueban, no se confían."""

import ast
from pathlib import Path

APP = Path(__file__).resolve().parents[1] / "app"
PUBLIC = {"service", "service.py"}


def _imports(path: Path) -> list[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    found = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module:
            found += [f"{node.module}.{alias.name}" for alias in node.names]
        elif isinstance(node, ast.Import):
            found += [alias.name for alias in node.names]
    return found


def test_domains_only_use_public_interfaces() -> None:
    allowed_suffixes = (".service", ".service.CompanyDep", ".service.PUBLIC_EXCLUDE")
    allowed_extra = {
        "app.domains.audit.anomalies",  # reglas públicas del Auditor
        "app.domains.knowledge.retriever",
        "app.domains.knowledge.embeddings",
        "app.domains.files.extract",
        "app.domains.company.models.Company",  # solo para iterar empresas en el pulso
    }
    violations = []
    for path in (APP / "domains").rglob("*.py"):
        domain = path.relative_to(APP / "domains").parts[0]
        for name in _imports(path):
            parts = name.split(".")
            if parts[:2] != ["app", "domains"] or len(parts) < 4 or parts[2] == domain:
                continue
            if name.endswith(allowed_suffixes) or name in allowed_extra or ".".join(parts[:4]) in allowed_extra:
                continue
            violations.append(f"{path.name}: {name}")
    assert violations == []


def test_core_does_not_depend_on_domains() -> None:
    for path in (APP / "core").rglob("*.py"):
        assert not [n for n in _imports(path) if n.startswith("app.domains")], path


def test_room_modules_are_self_contained() -> None:
    for folder in (APP / "room_modules").iterdir():
        if folder.is_dir() and folder.name != "__pycache__":
            assert len(list(folder.glob("*.py"))) < 5
