from app.core.plugins import BaseRoomModule, FurnitureSpec


class KnowledgeBaseModule(BaseRoomModule):
    key = "knowledge_base"
    name = "Base de conocimiento"
    description = "Documentos de apoyo de la sala (RAG)"
    ui_panel = "knowledge_base"
    furniture = [FurnitureSpec("bookshelf", 3, 1, interactive=True)]
    tool_names = ["search_knowledge"]


module = KnowledgeBaseModule()
