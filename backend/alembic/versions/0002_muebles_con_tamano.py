"""cada mueble tiene tamaño y estética"""

import sqlalchemy as sa
from alembic import op

revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('furniture', sa.Column('width', sa.Integer(), server_default='1', nullable=False))
    op.add_column('furniture', sa.Column('depth', sa.Integer(), server_default='1', nullable=False))
    op.add_column('furniture', sa.Column('variant', sa.String(length=30), server_default='classic', nullable=False))
    # La mesa de reuniones ya se dibujaba de 3 × 3 sobre una sola casilla: ahora ocupa lo que se ve.
    op.execute(
        "update furniture set width = 3, depth = 3, grid_x = grid_x - 1, grid_y = grid_y - 1 "
        "where model_key = 'meeting_table'"
    )


def downgrade() -> None:
    op.execute("update furniture set grid_x = grid_x + 1, grid_y = grid_y + 1 where model_key = 'meeting_table'")
    op.drop_column('furniture', 'variant')
    op.drop_column('furniture', 'depth')
    op.drop_column('furniture', 'width')
