from app.core.plugins import BaseRoomModule


class Team(BaseRoomModule):
    key = "team"
    name = "Equipo"
    description = "Agentes de la sala"
    ui_panel = "team"


module = Team()
