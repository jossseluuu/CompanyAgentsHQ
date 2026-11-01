from app.core.plugins import BaseRoomModule, FurnitureSpec


class FilingCabinet(BaseRoomModule):
    key = "filing_cabinet"
    name = "Archivador"
    description = "Ficheros de la sala"
    ui_panel = "filing_cabinet"
    furniture = [FurnitureSpec("filing_cabinet", 1, 1, interactive=True)]
    tool_names = ["read_file", "write_file", "search_files"]


module = FilingCabinet()
