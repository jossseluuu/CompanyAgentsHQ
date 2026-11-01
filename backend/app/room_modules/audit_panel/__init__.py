from app.core.plugins import BaseRoomModule, FurnitureSpec


class AuditPanel(BaseRoomModule):
    key = "audit_panel"
    name = "Panel de auditoría"
    description = "Registro en vivo, anomalías y trazas"
    ui_panel = "audit_panel"
    furniture = [FurnitureSpec("screen", 2, 1, interactive=True)]
    tool_names = ["read_audit"]


module = AuditPanel()
