from app.core.plugins import BaseRoomModule, FurnitureSpec


class Whiteboard(BaseRoomModule):
    key = "whiteboard"
    name = "Pizarra"
    description = "Notas libres compartidas de la sala"
    priority = "D"
    ui_panel = "whiteboard"
    furniture = [FurnitureSpec("whiteboard", 6, 1, interactive=True)]
    default_config = {"notes": []}
    tool_names = ["write_whiteboard"]


module = Whiteboard()
