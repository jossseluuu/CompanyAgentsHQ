from app.core.plugins import BaseRoomModule, FurnitureSpec


class CostMonitor(BaseRoomModule):
    key = "cost_monitor"
    name = "Costes en vivo"
    description = "Gasto de IA del día frente al límite"
    ui_panel = "cost_monitor"
    furniture = [FurnitureSpec("screen", 5, 1, interactive=True)]


module = CostMonitor()
