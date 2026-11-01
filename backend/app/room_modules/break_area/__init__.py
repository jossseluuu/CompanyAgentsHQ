from app.core.plugins import BaseRoomModule, FurnitureSpec


class BreakArea(BaseRoomModule):
    key = "break_area"
    name = "Zona de descanso"
    description = "Sofás y café; los agentes inactivos consolidan aquí su memoria"
    ui_panel = "break_area"
    furniture = [
        FurnitureSpec("sofa", 2, 1),
        FurnitureSpec("sofa", 5, 1),
        FurnitureSpec("coffee_machine", 20, 1, interactive=True),
        FurnitureSpec("plant", 9, 1),
    ]


module = BreakArea()
