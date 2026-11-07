"""Muebles que se pueden colocar: tamaños en casillas (ancho, fondo; el primero es el normal) y estéticas."""

from typing import Any

Size = tuple[int, int]

STYLES = ("classic", "dark", "light", "vivid")
ONE: tuple[Size, ...] = ((1, 1),)
LONG: tuple[Size, ...] = ((1, 1), (2, 1), (3, 1))

TWO: tuple[Size, ...] = ((1, 1), (2, 1))
GROUPS: dict[str, dict[str, tuple[Size, ...]]] = {
    "office": {
        "desk": LONG, "office_chair": ONE, "filing_cabinet": LONG, "bookshelf": LONG, "locker": LONG, "sideboard": TWO,
        "meeting_table": ((3, 3), (2, 2), (4, 3), (5, 3)), "reception_desk": ((3, 1), (2, 1), (4, 1)),
    },
    "boards": {
        "board": LONG, "whiteboard": LONG, "bulletin_board": LONG, "magnetic_board": LONG,
        "interactive_board": ((2, 1), (3, 1)), "flip_chart": ONE, "projector_screen": ((2, 1), (3, 1)),
    },
    "tech": {
        "screen": LONG, "television": TWO, "computer": ONE, "laptop": ONE, "projector": ONE, "server_rack": TWO,
        "printer": TWO, "photocopier": ONE, "scanner": ONE, "shredder": ONE,
    },
    "kitchen": {
        "coffee_machine": TWO, "water_cooler": ONE, "water_dispenser": ONE, "vending_machine": TWO,
        "drink_vending_machine": TWO, "refrigerator": ONE, "microwave": ONE,
    },
    "comfort": {
        "sofa": LONG, "air_conditioner": ONE, "air_purifier": ONE, "fan": ONE, "heater": TWO, "phone_booth": ONE,
        "soundproof_booth": ((2, 2),),
    },
    "safety": {
        "trash_can": ONE, "recycling_bin": ONE, "vacuum_cleaner": ONE, "fire_extinguisher": ONE, "security_camera": ONE,
        "turnstile": ONE,
    },
    "decor": {
        "plant": ((1, 1), (2, 2)), "lamp": ONE, "rug": ((1, 1), (2, 1), (2, 2), (3, 2), (3, 3)),
        "carpet": ((3, 3), (3, 2), (4, 3), (5, 3)), "curtain": TWO, "blinds": TWO, "wall_clock": ONE, "mirror": ONE,
        "painting": TWO, "sculpture": ONE, "aquarium": TWO, "umbrella_stand": ONE, "magazine_rack": ONE,
    },
    "storage": {
        "information_kiosk": ONE, "pallet_rack": ((2, 1), (3, 1)), "warehouse_rack": ((2, 1), (3, 1)),
        "industrial_workbench": ((2, 1), (3, 1)), "platform_trolley": ONE,
    },
}  # fmt: skip
FURNITURE: dict[str, tuple[Size, ...]] = {key: sizes for group in GROUPS.values() for key, sizes in group.items()}
MODULE_ONLY: dict[str, tuple[Size, ...]] = {"inbox": ONE}

# Se pisan: decoran el suelo sin cortar el paso.
WALKABLE = frozenset({"rug", "carpet"})


def sizes(model_key: str) -> tuple[Size, ...]:
    return FURNITURE.get(model_key) or MODULE_ONLY.get(model_key, ONE)


def default_size(model_key: str) -> Size:
    return sizes(model_key)[0]


def listing() -> list[dict[str, Any]]:
    return [
        {"key": key, "group": group, "sizes": [list(size) for size in options], "variants": list(STYLES)}
        for group, items in GROUPS.items()
        for key, options in items.items()
    ]
