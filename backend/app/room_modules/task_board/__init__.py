from app.core.plugins import BaseRoomModule, FurnitureSpec


class TaskBoard(BaseRoomModule):
    key = "task_board"
    name = "Tablón"
    description = "Kanban de tareas de la sala"
    ui_panel = "task_board"
    furniture = [FurnitureSpec("board", 2, 1, interactive=True)]
    tool_names = ["create_task", "update_task"]


module = TaskBoard()
