from app.core.plugins import BaseRoomModule, FurnitureSpec


class OwnerInbox(BaseRoomModule):
    key = "owner_inbox"
    name = "Bandeja del dueño"
    description = "Objetivos y aprobaciones pendientes"
    ui_panel = "owner_inbox"
    furniture = [FurnitureSpec("inbox", 6, 1, interactive=True)]


module = OwnerInbox()
