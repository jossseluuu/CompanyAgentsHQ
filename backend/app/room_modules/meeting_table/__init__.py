from app.core.plugins import BaseRoomModule, FurnitureSpec


class MeetingTable(BaseRoomModule):
    key = "meeting_table"
    name = "Mesa de reuniones"
    description = "Convocar reuniones y ver actas"
    priority = "D"
    ui_panel = "meeting_table"
    furniture = [FurnitureSpec("meeting_table", 5, 4, interactive=True)]


module = MeetingTable()
